# Alerting

## Units in this directory

| File | Purpose |
|---|---|
| `intuitive-gamepanel-alerts-tick.service` | oneshot — runs `npm run monitor:alerts` |
| `intuitive-gamepanel-alerts-tick.timer` | drives the service once a minute |

The timer exists in the repo because the schedule was previously hand-written on the
server only: a reinstall or a rebuilt host would silently lose alerting.

## Required environment

Two variables in the project-root `.env` gate alerting:

| Variable | Purpose |
|---|---|
| `ALERT_ENCRYPTION_KEY` | AES-256-GCM key for the per-user Discord webhook URLs stored in `AlertChannel`. **Set this before any user saves a webhook.** Changing it later makes every stored webhook unreadable and users must paste theirs again. |
| `DISCORD_ALERT_WEBHOOK_URL` | Legacy single-channel webhook. Superseded by per-user subscriptions and no longer read by the monitor; harmless to leave set or blank. |

Generate the key:

```bash
openssl rand -base64 32
```

## Install (on the panel host)

One command per block. Do not paste them as a single block — the terminal collapses
multi-line pastes into one line.

```bash
sudo cp deploy/intuitive-gamepanel-alerts-tick.service deploy/intuitive-gamepanel-alerts-tick.timer /etc/systemd/system/
```

```bash
sudo systemctl daemon-reload
```

```bash
sudo systemctl enable --now intuitive-gamepanel-alerts-tick.timer
```

## Verify

```bash
systemctl list-timers intuitive-gamepanel-alerts-tick.timer
```

```bash
sudo journalctl -u intuitive-gamepanel-alerts-tick.service -n 50 --no-pager
```

Run one tick immediately without waiting:

```bash
sudo systemctl start intuitive-gamepanel-alerts-tick.service
```

## Legacy unit

`intuitive-gamepanel-alerts.service` (the old long-running loop) is superseded by the timer
above. Disable it once the timer is confirmed working:

```bash
sudo systemctl disable --now intuitive-gamepanel-alerts.service
```

## Notes

- The tick unit runs as `gamepanel` with `WorkingDirectory` set to the live checkout, so
  `npm run monitor:alerts` resolves the same `.env` (and therefore the same
  `DATABASE_URL`) as the panel itself.
- `npm run monitor:alerts` is `tsx scripts/monitor-alerts.ts`. It loads `.env` via
  `@next/env`, so it does **not** need an `EnvironmentFile=`.
- The monitor resolves live status locally via systemd, or remotely through the node
  agent when the server has a `ServerNode` and is not the local node. It therefore needs
  the same systemd/agent privileges as the panel — which it has, since it shares its user.
- **The migration is a prerequisite.** The monitor reads `Incident`, `AlertChannel`,
  `AlertSubscription` and `AlertDelivery`. Run the migration before enabling the timer, or
  every tick dies on a missing table.

