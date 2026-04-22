package main

import (
	"testing"
)

// TestSyncHealth_IsFailedFlagFollowsSetFailed is the specific invariant that
// handleInternalHealth relies on: `IsFailed()` returns true iff setFailed
// has been called (and stays true until setRunning resets it). Without
// this, the k8s readiness probe can't see a dead sync loop.
func TestSyncHealth_IsFailedFlagFollowsSetFailed(t *testing.T) {
	sh := &syncHealth{status: "starting"}

	if sh.IsFailed() {
		t.Fatalf("fresh syncHealth: IsFailed() = true; want false")
	}

	sh.setFailed(5)
	if !sh.IsFailed() {
		t.Fatalf("after setFailed: IsFailed() = false; want true")
	}

	sh.setRunning(42)
	if sh.IsFailed() {
		t.Fatalf("after setRunning: IsFailed() = true; want false")
	}
}

// TestSyncHealth_IsFailedConcurrent verifies the atomic flag is safe to
// read from the health handler without acquiring the mutex. A race
// condition here would flap the readiness probe and cause pods to enter
// NotReady on every sync cycle boundary.
func TestSyncHealth_IsFailedConcurrent(t *testing.T) {
	sh := &syncHealth{}
	done := make(chan struct{})

	go func() {
		for i := 0; i < 10_000; i++ {
			sh.setFailed(i)
			sh.setRunning(i)
		}
		close(done)
	}()

	// Read side: must never panic or observe torn state.
	for i := 0; i < 10_000; i++ {
		_ = sh.IsFailed()
	}
	<-done
}
