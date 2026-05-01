<?php
/**
 * Scrollr Reply API — plugin entry point.
 *
 * Hooks the 'api' Signal that osTicket emits in api/http.php right after
 * its built-in URL dispatcher is registered. We append a single
 * URL pattern that maps to ScrollrReplyController::reply().
 *
 * The plugin has no admin-configurable options for now — auth is the
 * same X-API-Key the rest of the API already uses. We still must
 * declare a config class because osTicket's PluginInstance::bootstrap()
 * short-circuits when getConfig() returns null (the && chain at line
 * ~1159 of class.plugin.php). See config.php for the stub class.
 */

require_once INCLUDE_DIR . 'class.plugin.php';
require_once dirname(__FILE__) . '/config.php';

class ScrollrReplyPlugin extends Plugin {

    var $config_class = "ScrollrReplyPluginConfig";
    var $config;

    function bootstrap() {
        // Load the controller class up-front so it's available when
        // the route fires. We can't rely on url_post()'s file-loader
        // syntax to resolve plugin paths cleanly across versions —
        // safer to require_once explicitly here.
        require_once dirname(__FILE__) . '/api.reply.php';

        // The 'api' signal in api/http.php fires once with the global
        // dispatcher. Plugins append their own routes here.
        Signal::connect('api', function ($dispatcher) {
            $dispatcher->append(
                url_post(
                    "^/tickets/(?P<number>[\w-]+)/reply\.json$",
                    array('ScrollrReplyController', 'reply')
                )
            );
        });
    }
}
