# BarterHub Admin Feed Setup

The admin panel now prefers a scalable RTDB feed:

```text
admin_transactions/{transactionId}
admin_stats
```

When `admin_transactions` has records, the website stops attaching heavy per-user listeners to `transactions/{uid}`.
The old per-user transaction reader remains only as a fallback while the backend feed is not deployed yet.

## RTDB Rules

Add these rules under `rules`:

```json
"admin_transactions": {
  ".read": "auth != null && root.child('admin_users').child(auth.uid).val() == true",
  ".write": false,
  ".indexOn": ["timestamp", "type", "status", "source"]
},
"admin_stats": {
  ".read": "auth != null && root.child('admin_users').child(auth.uid).val() == true",
  ".write": false
}
```

Keep the existing `transactions` admin read rule until the new feed has been deployed and verified.

## Cloud Functions

Copy `firebase-admin-feed.example.js` into the Firebase Functions project, or merge its exports into the existing
`functions/index.js`.

After deploying the functions, create one new wallet transaction or PayMongo/premium record and verify that
`admin_transactions` receives a normalized copy.

Once verified, the admin panel will read latest records from `admin_transactions` and avoid looping through every user.
