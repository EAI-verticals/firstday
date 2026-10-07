# Firstday roles

Firstday has two user types:

- **Employee**: confirm personal details, upload/review documents, acknowledge policies, complete assigned tasks and sign pay confirmation.
- **Admin**: create hire records, prepare pay terms, assign tasks, review onboarding, request corrections and manage app settings.

Admin combines the former Employer and Admin views. The local demo supports this combined walkthrough in one browser/account. Hosted shared cases and emailed invitations remain unconnected.

## Access

Production Admin requires the exact trusted Microsoft Entra app-role claim `Firstday.Admin`. Other authenticated users enter as Employee. Choosing Admin in a menu or URL grants no privilege. Retired `Firstday.Employer` claims and cached Employer sessions do not gain Admin rights. A person who needs live Admin must receive `Firstday.Admin` from an authorized Entra administrator, then sign in with the updated role. No assignments were changed during this UI update.

## Compatibility

Old `previewRole=employer` links open the Admin demo locally. Production `role=employer` links target Admin but still require `Firstday.Admin`. Local saved task owners migrate from Employer to Admin on load. Existing files, profiles, signatures and the internal `employerReviewed` record field are preserved. Historical activity text remains intact.
