# Phase 3 API behavior

## Recommended creation order

1. Create an office.
2. Create a work schedule.
3. Create an employee assigned to both.
4. Deliver the returned temporary password through a secure channel.
5. Employee logs in and is forced to change it.

## Transaction boundaries

- Employee creation: user + employee role + employee profile + audit log.
- Employee password reset: new password hash + refresh-token revocation + audit log.
- Employee status change: employee state + login state + session revocation + audit log.
- Office/schedule mutations: configuration update + audit log.

## Current intentional limits

- One current office and one current schedule per employee.
- Schedule history and assignment effective dates are deferred until required by attendance history.
- Same-day work schedules only; overnight shifts are deferred to the attendance phase.
- Temporary passwords are returned in the API response once and are never persisted in plaintext.
