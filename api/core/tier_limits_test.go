package core

import (
	"encoding/json"
	"testing"
)

// TestDefaultTierLimits_Exact pins the numeric values shipped to production.
// If you change DefaultTierLimits you MUST update this test in the same PR —
// the diff is your intentional signal that billing/pricing agreed with the
// move, and that desktop/src/tierLimits.ts + myscrollr.com/src/routes/
// uplink.tsx were updated to match.
//
// Null (unlimited) is checked by pointer-nil, finite caps by *int value.
func TestDefaultTierLimits_Exact(t *testing.T) {
	cases := []struct {
		tier        string
		symbols     *int
		feeds       *int
		customFeeds *int
		leagues     *int
		fantasy     *int
	}{
		{"free", intPtr(5), intPtr(1), intPtr(0), intPtr(1), intPtr(0)},
		{"uplink", intPtr(25), intPtr(25), intPtr(1), intPtr(8), intPtr(1)},
		{"uplink_pro", intPtr(75), intPtr(100), intPtr(3), intPtr(20), intPtr(3)},
		{"uplink_ultimate", nil, nil, intPtr(10), nil, intPtr(10)},
		{"super_user", nil, nil, nil, nil, nil},
	}

	for _, c := range cases {
		got, ok := DefaultTierLimits[c.tier]
		if !ok {
			t.Errorf("missing tier: %q", c.tier)
			continue
		}
		assertIntPtrEq(t, c.tier+".symbols", c.symbols, got.Symbols)
		assertIntPtrEq(t, c.tier+".feeds", c.feeds, got.Feeds)
		assertIntPtrEq(t, c.tier+".custom_feeds", c.customFeeds, got.CustomFeeds)
		assertIntPtrEq(t, c.tier+".leagues", c.leagues, got.Leagues)
		assertIntPtrEq(t, c.tier+".fantasy", c.fantasy, got.Fantasy)
	}

	if len(DefaultTierLimits) != len(cases) {
		t.Errorf("DefaultTierLimits has %d tiers, expected %d — did you add a tier without updating this test?",
			len(DefaultTierLimits), len(cases))
	}
}

// TestTierLimitsJSONShape confirms JSON serialization renders missing caps
// as `null` (not `0`, which would mean "zero of this resource"). Both
// clients rely on this distinction.
func TestTierLimitsJSONShape(t *testing.T) {
	resp := TierLimitsResponse{Tiers: DefaultTierLimits}
	b, err := json.Marshal(resp)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}
	var parsed map[string]map[string]map[string]any
	if err := json.Unmarshal(b, &parsed); err != nil {
		t.Fatalf("json.Unmarshal round-trip: %v", err)
	}

	ult, ok := parsed["tiers"]["uplink_ultimate"]
	if !ok {
		t.Fatal("uplink_ultimate missing from JSON")
	}
	if ult["symbols"] != nil {
		t.Errorf("uplink_ultimate.symbols = %v (want null)", ult["symbols"])
	}
	if got, ok := ult["custom_feeds"].(float64); !ok || got != 10 {
		t.Errorf("uplink_ultimate.custom_feeds = %v (want 10)", ult["custom_feeds"])
	}

	free := parsed["tiers"]["free"]
	if got, ok := free["symbols"].(float64); !ok || got != 5 {
		t.Errorf("free.symbols = %v (want 5)", free["symbols"])
	}
}

func assertIntPtrEq(t *testing.T, label string, want, got *int) {
	t.Helper()
	if want == nil && got == nil {
		return
	}
	if want == nil || got == nil {
		t.Errorf("%s: want %v, got %v (one is nil)", label, derefOr(want, "nil"), derefOr(got, "nil"))
		return
	}
	if *want != *got {
		t.Errorf("%s: want %d, got %d", label, *want, *got)
	}
}

func derefOr(p *int, fallback string) any {
	if p == nil {
		return fallback
	}
	return *p
}
