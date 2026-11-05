/**
 * SetupInstructions.tsx
 *
 * Read-only, plain-language guides for the litterbox Wi-Fi setup and camera
 * pairing flows. The wording follows what the device setup page
 * (http://192.168.4.1) and Live View actually show. Nothing here changes
 * device or account settings.
 */

import type { ReactNode } from "react";

function Card({ title, children }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="rounded-xl border border-litter-border bg-litter-bg p-3">
      <p className="text-sm font-medium text-litter-text">{title}</p>
      {children}
    </div>
  );
}

function Steps({ start = 1, children }: { readonly start?: number; readonly children: ReactNode }) {
  return (
    <ol
      start={start}
      className="mt-2 list-decimal space-y-1.5 pl-5 text-xs leading-relaxed text-theme-muted"
    >
      {children}
    </ol>
  );
}

function Problems({ items }: { readonly items: ReadonlyArray<{ see: string; fix: string }> }) {
  return (
    <ul className="mt-2 space-y-2 text-xs leading-relaxed text-theme-muted">
      {items.map(({ see, fix }) => (
        <li key={see}>
          <span className="font-medium text-litter-text">{see}</span>
          <br />
          {fix}
        </li>
      ))}
    </ul>
  );
}

function Strong({ children }: { readonly children: ReactNode }) {
  return <span className="font-medium text-litter-text">{children}</span>;
}

export function WifiSetupInstructions() {
  return (
    <div className="space-y-4">
      <Card title="Before you start">
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-theme-muted">
          <li>Use a 2.4 GHz home Wi-Fi. Networks that are only 5 GHz will not work.</li>
          <li>Hotel or café Wi-Fi with a sign-in page, and work Wi-Fi that needs a username, will not work.</li>
          <li>
            Setting up the camera too? Do the camera steps first (see{" "}
            <Strong>How to set up the camera</Strong>). The setup Wi-Fi closes once the litterbox connects.
          </li>
        </ul>
      </Card>

      <Card title="Connect the litterbox to Wi-Fi">
        <Steps>
          <li>Plug in the litterbox and wait about 30 seconds.</li>
          <li>On your phone, open your Wi-Fi settings.</li>
          <li>Join the Wi-Fi called <Strong>LitterSense-Setup</Strong>.</li>
          <li>Enter the password <Strong>littersense</Strong>.</li>
          <li>If your phone says there is no internet, stay connected. This is normal.</li>
          <li>
            Wait for the setup page to open. If it does not open, go to{" "}
            <Strong>http://192.168.4.1</Strong> in your browser.
          </li>
          <li>Type your home Wi-Fi name.</li>
          <li>Type your home Wi-Fi password.</li>
          <li>Tap <Strong>Connect litterbox</Strong>.</li>
          <li>Wait up to 30 seconds while it says &quot;Testing Wi-Fi&quot;. Stay on LitterSense-Setup.</li>
          <li>When you see <Strong>Connected and saved!</Strong>, switch your phone back to your usual Wi-Fi.</li>
        </Steps>
        <p className="mt-2 text-xs leading-relaxed text-theme-muted">
          The litterbox remembers this Wi-Fi when it is unplugged. If you move it somewhere new, it opens
          LitterSense-Setup on its own after about 30 seconds, so you can repeat these steps.
        </p>
      </Card>

      <Card title="If something goes wrong">
        <Problems
          items={[
            {
              see: "“Could not connect. Check the name, password and 2.4 GHz signal…”",
              fix: "Check the Wi-Fi name and password. Capital letters matter. Move the litterbox closer to your router, then tap Connect litterbox again. Your previous Wi-Fi is still saved.",
            },
            {
              see: "“Use a 1-32 byte Wi-Fi name and an 8-63 character password…”",
              fix: "Wi-Fi passwords must be 8 to 63 characters. If your Wi-Fi has no password, leave the password box empty.",
            },
            {
              see: "“Wi-Fi connected, but saving failed.”",
              fix: "Tap Connect litterbox again. Otherwise the litterbox will forget this Wi-Fi when it restarts.",
            },
            {
              see: "“Connection interrupted…” or “Join LitterSense-Setup first.”",
              fix: "Your phone left the setup Wi-Fi. If you already saw Connected and saved, you are done. If not, join LitterSense-Setup again and reload the page.",
            },
            {
              see: "I can't find LitterSense-Setup in my Wi-Fi list.",
              fix: "It only appears when the litterbox can't reach its saved Wi-Fi. Wait 30 seconds after plugging it in, then check your Wi-Fi list again.",
            },
          ]}
        />
      </Card>
    </div>
  );
}

export function CameraSetupInstructions() {
  return (
    <div className="space-y-4">
      <Card title="Before you start">
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-theme-muted">
          <li>Pairing lets you watch the litterbox camera in Live View from anywhere. You only need to do it once.</li>
          <li>
            Setting up a new litterbox? Pair the camera <Strong>before</Strong> you enter your home Wi-Fi.
          </li>
          <li>Making a new pairing code disconnects any camera you paired before, until you enter the new code.</li>
        </ul>
      </Card>

      <Card title="1. Get a pairing code">
        <Steps>
          <li>While your phone is on your usual Wi-Fi or mobile data, open <Strong>Live View</Strong> in this app.</li>
          <li>If you see <Strong>Connect Device</Strong>, tap it.</li>
          <li>Tap <Strong>Pair camera</Strong>.</li>
          <li>Tap <Strong>Create pairing code</Strong>.</li>
          <li>Copy the whole code that appears. Keep it private.</li>
        </Steps>
      </Card>

      <Card title="2. Open the litterbox setup page">
        <Steps start={6}>
          <li>
            Plug in the litterbox and wait about 30 seconds.
            <br />
            Already on your home Wi-Fi? Turn off your Wi-Fi router instead, then wait about 30 seconds.
          </li>
          <li>Join the Wi-Fi called <Strong>LitterSense-Setup</Strong> (password <Strong>littersense</Strong>).</li>
          <li>
            Wait for the setup page to open. If it does not open, go to{" "}
            <Strong>http://192.168.4.1</Strong> in your browser.
          </li>
        </Steps>
      </Card>

      <Card title="3. Enter the pairing code">
        <Steps start={9}>
          <li>Scroll down to <Strong>Remote camera</Strong>.</li>
          <li>Paste the code into <Strong>Camera pairing code</Strong>.</li>
          <li>Tap <Strong>Save camera pairing and restart</Strong>.</li>
          <li>Wait for <Strong>Camera paired. Restarting</Strong>.</li>
        </Steps>
      </Card>

      <Card title="4. Finish">
        <Steps start={13}>
          <li>
            New litterbox: wait about 30 seconds for LitterSense-Setup to come back, then follow{" "}
            <Strong>How to connect to Wi-Fi</Strong>.
            <br />
            Turned your router off: turn it back on now.
          </li>
          <li>Switch your phone back to your usual Wi-Fi.</li>
          <li>Open <Strong>Live View</Strong>. When you see the <Strong>LIVE</Strong> label, the camera is working.</li>
        </Steps>
      </Card>

      <Card title="If something goes wrong">
        <Problems
          items={[
            {
              see: "“Invalid pairing code or storage unavailable.”",
              fix: "Copy the whole code again and paste it. If it still fails, create a new pairing code in Live View and try again.",
            },
            {
              see: "“Reload the setup page.”",
              fix: "Reload the page, paste the code again, and tap Save camera pairing and restart.",
            },
            {
              see: "Live View says “Pair your camera to enable remote viewing.”",
              fix: "The camera isn't paired yet. Start again from step 1.",
            },
            {
              see: "Live View shows WAITING or “Waiting for a fresh camera frame…”",
              fix: "Tap Reconnect. If it stays, check that the litterbox is plugged in and connected to Wi-Fi.",
            },
            {
              see: "“Camera pairing unavailable…” or “Remote camera hosting is not configured or is unavailable.”",
              fix: "The camera service is not reachable right now. Try again later.",
            },
          ]}
        />
      </Card>
    </div>
  );
}
