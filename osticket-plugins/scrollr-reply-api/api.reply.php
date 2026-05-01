<?php
/**
 * ScrollrReplyController — handles POST /api/tickets/{number}/reply.json
 *
 * This is the only endpoint this plugin exposes. The dispatcher in
 * class.ScrollrReplyPlugin.php captures {number} from the URL and
 * passes it as `$args` to reply(); the JSON body is read from the
 * standard ApiController helpers.
 *
 * Request body (JSON):
 *   {
 *     "reply_html":   "<p>...</p>",         // required, body of the reply
 *     "staff_id":     1,                    // optional, the agent posting
 *     "staff_email":  "support@...",        // optional, alternative to staff_id
 *     "signal_alert": true,                 // optional, default true — send user notification
 *     "claim":        false,                // optional, default false — assign ticket to staff
 *     "title":        "Re: subject"         // optional, override the subject
 *   }
 *
 * One of {staff_id, staff_email} must resolve to a valid staff agent.
 * The reply will be attributed to that agent in the thread history,
 * and the outbound notification email's From: will be the department's
 * reply-from address (per Dept::getReplyEmail()).
 *
 * Response on success (200):
 *   {
 *     "status":         "ok",
 *     "ticket_number":  "239171",
 *     "ticket_id":      1247,
 *     "entry_id":       45822,
 *     "alert_sent":     true
 *   }
 *
 * Response on failure (4xx/5xx) is the standard osTicket ApiController
 * error envelope: { "error": "message" } with appropriate status.
 *
 * The endpoint is auth'd by X-API-Key (requireApiKey enforces both the
 * key validity AND the IP-binding on the api key row). No additional
 * signing — same threat model as the existing ticket-create endpoint.
 */

require_once INCLUDE_DIR . 'class.api.php';
require_once INCLUDE_DIR . 'class.ticket.php';
require_once INCLUDE_DIR . 'class.staff.php';

class ScrollrReplyController extends ApiController {

    /**
     * Map a request format to the JSON content-type the dispatcher
     * routes. We only accept JSON for now.
     */
    function getRequestStructure($format, $data = null) {
        $supported = array(
            'reply_html', 'staff_id', 'staff_email', 'signal_alert',
            'claim', 'title',
        );

        if ($format !== 'json') {
            return null;
        }

        return $supported;
    }

    /**
     * Validate inbound JSON shape.
     */
    function validate(&$data, $format, $strict = true) {
        if (!isset($data['reply_html']) || !is_string($data['reply_html'])
                || trim($data['reply_html']) === '') {
            $this->exerr(400, __('reply_html is required and must be a non-empty string'));
        }
        // Bound the body to avoid abusing this as a denial-of-service
        // vector. osTicket itself will further validate via its
        // ResponseForm, but a quick guard at the entry point is cheap.
        if (strlen($data['reply_html']) > 65536) {
            $this->exerr(413, __('reply_html exceeds 65536 bytes'));
        }
    }

    /**
     * Endpoint handler. URL pattern in the dispatcher captures {number}
     * which is delivered through $args by the framework.
     */
    function reply($number) {
        // 1. Auth — same as TicketApiController::create. Validates
        //    X-API-Key header AND the api key's bound IP. 401 on either
        //    failure.
        $key = $this->requireApiKey();
        if (!$key->canCreateTickets()) {
            // Reusing the create-tickets capability flag; rationale: a
            // key that can post agent replies should already be
            // sufficiently trusted to create tickets too. If you want a
            // separate flag, add one to ost_api_key and check it here.
            return $this->exerr(403, __('API key not authorised to post replies'));
        }

        // 2. Parse + validate JSON body.
        $data = $this->getRequest('json');
        $this->validate($data, 'json');

        // 3. Look up the ticket by number from the URL.
        // osTicket's UrlMatcher::dispatch strips named captures and passes
        // remaining captures as positional args via call_user_func_array,
        // so $number is the bare ticket-number string from the URL.
        if (!is_string($number) || !preg_match('/^[\w-]+$/', $number)) {
            return $this->exerr(400, __('Invalid ticket number in URL'));
        }
        $ticket = Ticket::lookupByNumber($number);
        if (!$ticket) {
            return $this->exerr(404, __('Ticket not found'));
        }

        // 4. Resolve the staff agent who's posting the reply.
        $staff = $this->resolveStaff($data, $ticket);
        if (!$staff) {
            return $this->exerr(400, __('Could not resolve staff agent (provide staff_id or staff_email)'));
        }

        // 5. Build the reply payload in the shape Ticket::postReply()
        //    expects. This mirrors what the agent web UI submits when
        //    an agent fills the reply form on a ticket page.
        $vars = array(
            'response'    => $data['reply_html'],
            'reply-to'    => 'all',  // notify owner + collaborators by default
            'ticket_id'   => $ticket->getId(),
            'staffId'     => $staff->getId(),
            'poster'      => $staff,
            'cannedattachments' => array(),
            'attachments' => array(),
            // Optional: override the outbound email subject
            'title'       => isset($data['title']) ? (string) $data['title'] : null,
        );

        // Optional behaviours
        $alert = !isset($data['signal_alert']) || (bool) $data['signal_alert'];
        $claim = isset($data['claim']) && (bool) $data['claim'];
        if ($claim) {
            // Assigning before reply mimics agent UI's "claim on response"
            // workflow. Not required for the reply itself.
            $form = new \AssignmentForm(array(), array());
            $form->setStaffId($staff->getId());
            $errors = array();
            $ticket->assign($form, $errors);
            // Assignment errors are non-fatal — log and continue.
            if ($errors) {
                $this->logWarning('scrollr-reply-api: assignment failed', $errors);
            }
        }

        // 6. Dispatch the reply through Ticket::postReply().
        //    This is the SAME method the agent web UI invokes when an
        //    agent clicks "Submit Reply" on the ticket page. It:
        //      - Calls $ticket->getThread()->addResponse($vars, $errors)
        //        which creates a ResponseThreadEntry (type='R')
        //      - Sends the user notification via $dept->getReplyEmail()
        //        if $alert is truthy and the dept's autoresponder
        //        settings allow it
        //      - Fires Signal::send('thread.response.posted', $entry)
        //      - Updates ost_ticket.lastupdate, isanswered=1, optionally
        //        clears overdue flag, etc.
        $errors = array();
        $entry = $ticket->postReply($vars, $errors, $alert);

        if (!$entry) {
            $errMsg = $errors ? implode('; ', array_map('strval', $errors)) : __('postReply returned null without explicit errors');
            return $this->exerr(500, sprintf(__('Failed to post reply: %s'), $errMsg));
        }

        // 7. Success.
        $payload = array(
            'status'         => 'ok',
            'ticket_number'  => $ticket->getNumber(),
            'ticket_id'      => $ticket->getId(),
            'entry_id'       => method_exists($entry, 'getId') ? $entry->getId() : null,
            'alert_sent'     => $alert,
            'staff_id'       => $staff->getId(),
            'staff_name'     => $staff->getName()->asVar(),
        );

        $this->response(200, json_encode($payload), 'application/json');
    }

    /**
     * Resolve the staff agent who posts the reply.
     *
     * Priority:
     *   1. data['staff_id']    — direct lookup by id
     *   2. data['staff_email'] — lookup by email (Staff::getIdByEmail)
     *   3. ticket's currently-assigned staff — fallback if unspecified
     *
     * Returns Staff object or null.
     */
    private function resolveStaff($data, $ticket) {
        if (!empty($data['staff_id']) && is_numeric($data['staff_id'])) {
            $s = Staff::lookup((int) $data['staff_id']);
            if ($s) {
                return $s;
            }
        }
        if (!empty($data['staff_email']) && is_string($data['staff_email'])) {
            $sid = Staff::getIdByEmail($data['staff_email']);
            if ($sid) {
                $s = Staff::lookup($sid);
                if ($s) {
                    return $s;
                }
            }
        }
        // Fallback: ticket's current assignee.
        $assigned = $ticket->getStaff();
        if ($assigned) {
            return $assigned;
        }
        return null;
    }

    /**
     * Lightweight logger; uses osTicket's global logger if available.
     */
    private function logWarning($msg, $context = null) {
        global $ost;
        if ($ost && method_exists($ost, 'logWarning')) {
            $body = $context ? $msg . "\n\n" . print_r($context, true) : $msg;
            $ost->logWarning('scrollr-reply-api', $body);
        }
    }
}
