# Sales office payment info

Each sales office gets an optional free-text **Payment Info** field. It shows under "Make checks payable to" on the customer's Approved Quote tab. Blank shows nothing, so a US office no longer says "e-transfers".

- **DB:** `SalesOffices.payment_info text` (nullable), synced by PowerSync.
- **Form:** textarea in the sales office modal with a live preview of the box the customer sees (same component).
- **Removed:** the hard-coded e-transfer line. The text is shown as typed, so it is not translated to French.
- **After deploy:** put "e-transfers to payments@bleacherrentals.com" in the Canadian office's field.
- **Permissions:** unchanged (admins manage sales offices).
