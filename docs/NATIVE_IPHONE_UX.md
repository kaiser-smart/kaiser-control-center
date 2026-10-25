# iPhone native PWA behavior

Scope: presentation changes based on production 0.1.834, commit 3ffafa91. No server, database, role, account, Cloudflare binding, map provider or desktop layout change.

The mobile main element is the bounded scroll surface. Its height follows 100dvh (100vh fallback) and VisualViewport at scale 1. The document is locked only for mobile application/login shells. Safe areas are retained. Fixed navigation follows the visible viewport; the keyboard temporarily hides bottom navigation and reveals a focused field. Existing hash targets scroll the main element; redraws preserve its scroll position on the same route. Coarse-pointer landscape phones keep the mobile layout.

All mobile inputs, including login and dialogs, use 16px text. Touch-action manipulation prevents accidental double-tap page zoom where WebKit supports it. Installed iOS PWA gesturestart/gesturechange are canceled outside map surfaces. Browser pinch zoom, system accessibility and selection of user data are retained. No maximum-scale, user-scalable=no or blanket touch-action:none.

Rapid repeat activation of an action is ignored within 400ms, including a replaced control with the same identity. Editing a field resets the guard. Map controls, pagination and expanded/pressed toggles allow repeated intentional use. Existing asynchronous business-operation guards remain authoritative; this is not server idempotency.

Validation: WebKit at 375x667, 390x844 and 430x932; 26 routes; scroll bounds, input sizes, navigation, lists/forms, desktop, login/logout and seven roles. Additional synthetic viewport/gesture events and landscape checks test the app policy, not physical iPhone hardware. Real iOS keyboard animation, OS accessibility gestures, Dynamic Island insets, home-screen launch and two-finger map gestures still require physical verification. Live provider map interaction is separate from layout/configuration tests.

Release uses the existing guarded production script. Cloudflare must still report the expected baseline immediately before upload. Rollback candidate: 7991eafd-e563-45a8-8d7f-bb856532675b (0.1.834 / 3ffafa91); verify its successful deploy stage before use. On failed postdeploy verification, the publish wrapper restores that deployment and independently checks canonical and public build identity. Tests reject stale production, wrong accounts/projects, altered files and unavailable rollback. No trial rollback of production is performed.
