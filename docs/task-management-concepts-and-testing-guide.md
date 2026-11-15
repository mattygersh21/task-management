# Task management: development, draft retention, validation, and testing

A conceptual guide based on the explanations and corrections in this development conversation. This is an organized explanation, not a verbatim transcript. Prepared November 15, 2026, America/Chicago.

## Local processes and Docker

The backend debugger launches Spring Boot as a Java process on the host using the `local` profile. The frontend development server also runs on the host; its debugger opens Chrome. Neither application process appears in `docker ps`, which lists running containers.

This project's Docker Compose configuration runs PostgreSQL. Its container listens on port 5432 internally and is published at `127.0.0.1:5434` on the host. Host port 5434 avoids another project's database on host port 5432. The frontend runs at `http://localhost:4200`, and the backend task API is at `http://localhost:8081/task`.

A desktop database client connects to the published host address, not to an automatically discovered container. DBeaver's connection used the correct host and port but had empty username and password fields. PostgreSQL's error, “The server requested SCRAM-based authentication, but no password was provided,” showed that the server was reachable and authentication was the problem. Supplying the configured credentials and saving them resolved the connection. No container or port change was needed. Credentials are intentionally not repeated in this guide.

## Saved tasks versus unsaved drafts

“Data survives a reload” can describe two different requirements:

- Saved-task persistence: Save sends changes to the backend and database; reloading retrieves those saved changes.
- Unsaved-draft restoration: refreshing while editing reopens the dialog and restores values that have not been saved to the task.

The requested feature implements unsaved-draft restoration. Draft persistence must not silently update the saved task. Successful Save applies changes through the existing API; Cancel discards the draft.

A draft contains the task ID, title, description, due date, and status. A task ID of zero represents a new task. Dates are serialized to strings for storage and converted back to `Date` values when restoring the form.

## When drafts are saved and restored

The implementation writes to browser `sessionStorage` as reactive form values change. It does not depend on a timer, a deliberate reload, or an unload handler. Saving only during unload is unreliable: a crash or abrupt closure may prevent that handler from completing.

When the list initializes, it checks for a stored draft and opens the corresponding task dialog. The dialog restores the draft instead of fetching saved task values over it. Successful Save or explicit Cancel clears the draft. Failed Save leaves the draft available.

Draft storage is scoped to the origin and browser tab session and survives reloads in that tab. It is not intended as durable storage across closed sessions. Browser session restoration can affect actual lifetime; closing a tab is not a secure-erasure guarantee. Independently opened tabs ordinarily have separate storage; a tab opened with an opener may initially receive a copy.

Invalid stored data is rejected. If storage is blocked or full, editing remains available, but retention cannot be guaranteed. A delayed response that loads an existing task must not overwrite edits made while that request was pending.

## Reactive forms and Angular change detection

The key subscription in `CreateComponent.ngOnInit` is:

```ts
this.draftSubscription = this.taskForm.valueChanges.subscribe(
  () => this.persistDraft()
);
```

The event sequence is:

1. The user types into an input or changes a date or status selection.
2. Angular's form binding and control value accessor update the corresponding `FormControl`.
3. The containing `FormGroup` emits through `valueChanges`.
4. The subscriber invokes `persistDraft()`.
5. That method obtains the complete form value, serializes the date, and calls `taskDraftService.write()`.
6. The service serializes the draft and writes it to `sessionStorage`.

This is reactive-form event handling. A change-detection hook such as `ngDoCheck` does not poll the form to trigger saving. Angular also updates the rendered view, but that rendering mechanism should not be confused with the form observable that triggers persistence.

Programmatic `setValue` and `patchValue` calls normally emit form events too. Passing `{ emitEvent: false }` suppresses those emissions. The task-loading code uses that option and explicitly persists its initial values afterward. Draft restoration occurs before the change subscription is installed.

`getRawValue()` includes disabled controls, whereas a form group's ordinary `value` can omit them. The subscriptions are unsubscribed in `ngOnDestroy` so destroyed dialogs do not keep reacting to changes or pending task-loading responses.

## Storage choices and security

Browser storage is accessible to JavaScript executing with the application's origin. A cross-site scripting (XSS) vulnerability could expose draft text in `sessionStorage`. Browser storage does not provide application-level encryption or authorization. It should not hold session credentials or secrets.

Server-side storage can offer ownership checks, centralized expiry, and persistence policies when those are implemented. A backend HTTP session could identify a browser through an opaque HttpOnly cookie while keeping draft content on the server. In-memory sessions may expire or disappear on backend restart; durable backend storage requires additional design.

However, server-side storage is not automatically safer for this particular threat. Malicious JavaScript running as the application could request a draft using the application's API, read restored form fields, or capture typing. HttpOnly prevents script from reading the cookie itself; it does not prevent script from making requests that use the cookie.

| Consideration | Browser session storage | Backend session |
| --- | --- | --- |
| Malicious application JavaScript | Can read stored drafts directly | Can request accessible drafts or read restored fields |
| Session token protection | Keep tokens out of browser storage | HttpOnly can protect the cookie value |
| Unsaved text sent to the server | No | Yes |
| Complexity | Lower | Higher; session, cookie, and request protections are needed |
| Reload restoration | Yes | Yes, while the session remains valid |

The codebase has no user login, authentication configuration, or task-owner field. Tasks form one shared collection. This supports a single-user practice interpretation, but single-user access is not enforced by the code.

For ordinary task drafts in this practice application, session storage was selected after discussing the tradeoffs. The earlier suggestion that backend storage was inherently more secure was corrected. Neither approach guarantees draft confidentiality after the application itself is compromised.

The main protections against malicious application code are preventing execution in the first place: safe rendering, avoiding unsafe HTML insertion, maintained dependencies, and an appropriate Content Security Policy. Restored values remain untrusted input. Encrypting data does not solve active compromise if the same compromised application can obtain the key or decrypted text.

## Constructors and ngOnInit

A constructor creates the TypeScript object and receives injected dependencies. `ngOnInit` is an Angular lifecycle hook called once after initial input values are established. It provides a clear location for component initialization such as loading task details, restoring drafts, and registering subscriptions.

Initialization in the earlier constructor worked because injected dialog data was already available. It did not require access to rendered elements. There was no special need to place it there, so it was moved into `ngOnInit`; the constructor now focuses on dependency injection. This is an organizational improvement, not a rule that every assignment must move out of a constructor. Class field initializers remain suitable for straightforward initial state, including form construction.

Directly calling `new CreateComponent(...)` does not cause Angular lifecycle hooks to execute. Tests constructing the class manually must call the relevant hooks themselves.

## Whitespace title validation and blur

`Validators.required` rejects empty or null titles but does not reject a string containing spaces. The title now also uses:

```ts
Validators.pattern(/\S/)
```

The regular expression requires at least one non-whitespace character. It rejects spaces, tabs, newlines, and whitespace such as a non-breaking space. A title such as `  Valid task  ` remains valid; validation does not trim or otherwise rewrite the title.

The form becomes invalid as the value changes, disabling Save. The whitespace-specific message is displayed after the control is touched, normally when the user leaves the input:

> Title cannot contain only whitespace. Enter at least one non-whitespace character.

Angular Material's error state also governs error display. Once the control has been touched, subsequent invalid edits can show the error immediately. Correcting the value removes it.

Validation was not changed to `updateOn: 'blur'`: doing so would delay model updates and could compromise draft retention for text typed immediately before reload. Values and drafts continue updating as the user types; blur controls when the message becomes visible. The existing Save handler also checks form validity, so invoking it directly cannot submit an invalid title.

This is frontend validation. It does not establish backend enforcement against callers bypassing the UI.

## Direct-construction tests and TestBed tests

Jasmine's `describe` groups tests, and `beforeEach` runs setup before each test. Neither requires Angular `TestBed`. The setup can prepare plain objects or configure an Angular testing environment.

The draft-restoration tests instantiate the class directly, supply dependencies manually, and call lifecycle methods:

```ts
component = new CreateComponent(dialog, tasks, taskDraftService, 7);
component.ngOnInit();
```

This isolates component logic and gives precise control over service responses. Tests check restored values, draft retention, failed saves, cleanup, and delayed-response handling. No HTML is rendered. Tests manipulate controls directly rather than manually connecting DOM inputs to them.

The title-validation tests use `TestBed` to let Angular create the component, resolve injected dependencies, render the template, and connect form bindings:

```ts
const fixture = TestBed.createComponent(CreateComponent);
fixture.detectChanges();
```

`fixture.detectChanges()` triggers Angular's initial lifecycle and view update. Tests dispatch input and blur events, inspect displayed messages, and check the Save button's disabled state.

| Direct construction | TestBed |
| --- | --- |
| Isolates TypeScript component logic | Exercises the component within Angular |
| Passes dependencies manually | Uses configured dependency injection |
| Calls lifecycle methods manually | Runs lifecycle through the fixture |
| Does not render the template | Supports DOM and template checks |

Direct tests can pass despite broken template bindings, missing injection providers, or lifecycle timing problems. TestBed provides greater fidelity to Angular runtime behavior when the tests actually exercise those interactions. Merely constructing a component with TestBed does not verify all interactions.

The approaches complement each other. A TestBed test that edits and recreates the dialog would strengthen draft integration coverage. An actual browser reload test would verify the complete reload workflow. The current draft recreation tests should not be described as end-to-end browser reload tests.

## Why the IDE underlined Jasmine names

The screenshot showed red underlines beneath names such as `describe`, `beforeEach`, `afterEach`, `it`, `expect`, and `jasmine.SpyObj`. These are Jasmine declarations, not special TypeScript syntax.

The root frontend configuration now references its application and test configurations:

```json
"files": [],
"references": [
  { "path": "./tsconfig.app.json" },
  { "path": "./tsconfig.spec.json" }
]
```

The test configuration includes `src/**/*.spec.ts` and specifies `"types": ["jasmine"]`. This loads declarations from the installed `@types/jasmine` package. Those declarations tell the editor what Jasmine's global functions and namespace mean and enable type checking and autocomplete.

TypeScript's language server uses the references to discover which configuration owns a file. A fresh check initially selected the broad root configuration; after the references were added, it selected `tsconfig.spec.json` and reported no semantic errors. The screenshot's exact stale editor diagnostics were not retrieved, so that result demonstrates correct configuration discovery rather than proving every original underline's cause.

The test runner already explicitly used `tsconfig.spec.json`; this explains why tests could run while the editor showed errors. If stale underlines remain after the configuration change, run **TypeScript: Restart TS Server** in VS Code.

## Coverage, test failures, and verification

The frontend includes Karma, Jasmine, and `karma-coverage`. No documented coverage target or enforced threshold was found. No backend coverage configuration was found either. The generated HTML report is `frontend/coverage/task-management/index.html`, and coverage output is ignored by Git.

From the frontend directory, run the full suite with coverage:

```bash
npm test -- --watch=false --browsers=ChromeHeadless --code-coverage
```

An earlier command restricted execution to task tests using `--include='src/app/task/**/*.spec.ts'`. Those tests passed, but the restricted run did not establish that the complete suite passed. Its coverage percentage was not a full-suite coverage result.

The full run reproduced 13 successful tests and two failures unrelated to coverage instrumentation:

1. `AppComponent` still expected Angular's starter `Hello, task-management` heading even though the actual template contains a router outlet. The test now checks the routed-content outlet.
2. `ConfirmDialogComponent` lacked `MatDialogRef` and `MAT_DIALOG_DATA` providers in its test setup. Supplying those dependencies fixed construction. Tests also check the supplied message and the Cancel/Yes results.

The draft-save failure test deliberately simulates a network error. Its console error was expected output, not an additional failing test. The test now spies on and asserts the error logging so it does not print a misleading stack trace.

After these fixes, the complete suite passed 17 tests with zero failures. Coverage at that point was:

| Metric | Coverage |
| --- | --- |
| Statements | 75.86% |
| Branches | 79.54% |
| Functions | 64.86% |
| Lines | 75.22% |

These are measurements of the instrumented frontend code in that run, not a contractual target or evidence of complete behavioral coverage. Production build and `git diff --check` also passed. The build still reports an initial bundle-size warning; this is separate from test failures and coverage.

## Branches, commits, and pull requests

A branch starts at a particular commit; it does not retain a permanent parent-child relationship. Creating a branch from `Mock-1` gives it that branch's history at creation time. Checking it out makes it the active local branch. Pushing publishes it to GitHub; creating it locally alone does not publish it.

A pull request is GitHub's name for what was called a merge request in the conversation. Its head is the feature branch, and its base is the intended merge destination. Committing records changes locally; pushing publishes those commits; merging the pull request adds the changes to its base branch. Remote and local branches can then differ until fetched and updated.

`Mock-1` was created from `development`. The draft-retention feature was developed on `form-data-retention-on-reload` and merged into `Mock-1` through pull request #4. `form-validation` was then created from the updated `Mock-1` for title validation, test repairs, and editor configuration improvements.

The final requested sequence is consistent: commit this guide and the pending frontend changes on `form-validation`, merge that branch into `Mock-1`, update local `Mock-1`, then create and activate `mock-2` from it. The pre-existing local modification to `backend/mvnw` is unrelated and must remain uncommitted. Branch names are case-sensitive: `Mock-1` and `mock-2` use the user's requested casing.

## Sources consulted

- [Angular reactive forms overview](https://github.com/angular/angular/blob/19.1.4/adev/src/content/guide/forms/overview.md)
- [Angular form validation](https://github.com/angular/angular/blob/19.1.4/adev/src/content/guide/forms/form-validation.md)
- [TypeScript solution-style configuration](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-9.html#support-for-solution-style-tsconfigjson-files)
- [OWASP HTML5 security guidance](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP XSS prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html)
- [DBeaver credential preconfiguration](https://dbeaver.com/docs/dbvr/Pre-Configure-Credentials/)

Repository code and executed commands supplied the project-specific findings. Earlier explanations were consolidated and corrected where necessary; this guide does not reproduce every command output or conversational sentence.
