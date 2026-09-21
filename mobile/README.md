# U-BEE mobile app

Native .NET MAUI mobile client for the existing Node.js/Express/MongoDB banking backend. The backend is **not modified** by this project.

## Stack

- .NET 10 / .NET MAUI single project
- C# + XAML
- CommunityToolkit.Mvvm
- MVVM separation
- `IHttpClientFactory` typed `HttpClient`
- Bearer access token + rotating refresh token
- `SecureStorage` for tokens
- Android + iOS

## Project

```text
UBee.sln
└── UBee.App
    ├── Models/
    ├── Services/
    ├── ViewModels/
    ├── Views/
    ├── Resources/
    ├── appsettings.json
    └── MauiProgram.cs
```

## API base URL

Edit the single value in `appsettings.json`:

```json
{
  "Api": {
    "BaseUrl": "https://YOUR-UBEE-BACKEND.example.com/api/v1/"
  }
}
```

The value must end at `/api/v1/` and have a trailing `/`.

For an Android emulator talking to a backend running on your development computer, do not use `localhost`; use the Android emulator host alias such as `http://10.0.2.2:3000/api/v1/`. For a physical phone, use the development machine's LAN address and make sure the backend accepts the connection.

For iOS Simulator, a locally running backend can normally use the host machine address/localhost depending on the simulator/network setup.

## Authentication contract

The MAUI app intentionally ignores the backend's legacy httpOnly cookie. Login must provide JSON containing:

```json
{
  "accessToken": "...",
  "refreshToken": "...",
  "expiresIn": 900
}
```

The current Phase 10 backend in the supplied codebase already exposes this bearer/refresh flow at:

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/login/mfa-verify`
- `POST /api/v1/auth/token/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me`

Access and refresh tokens are stored using MAUI `SecureStorage`, never `Preferences` or a plain file.

When an authenticated API request receives HTTP 401, `ApiClient` attempts one refresh using the stored refresh token. The backend rotates the refresh token, and both new tokens replace the old values. The original request is then retried once. A semaphore prevents multiple simultaneous requests from refreshing the same session concurrently.

## Money movement / idempotency

Transfer confirmation generates a fresh GUID for each submission attempt and sends it both as:

- `idempotencyKey` JSON field
- `Idempotency-Key` HTTP header

The submit button is disabled while the request is in flight.

The app does not automatically retry a money-moving request after an arbitrary network exception, which avoids creating accidental duplicate submissions. The backend's idempotency contract remains authoritative.

## Screens

### Wired to current backend

- Login
- Register
- MFA/OTP verification for the existing login MFA endpoint
- Dashboard
- Wallet
- Transfer with confirmation + idempotency
- Transactions with cursor-ready incremental loading
- KYC submit/status
- Settings / profile / logout

### UI/API placeholders that intentionally do not fake success

- Forgot Password: calls `/api/v1/auth/forgot-password`; current backend does not implement it, so the UI displays the real error.
- Reset Password: calls `/api/v1/auth/reset-password`; currently unavailable until the backend adds it.
- Resend OTP: intentionally reports that no resend endpoint exists in the current contract.
- Notifications: empty state because there is no customer notification API.
- Beneficiaries: fully usable local device storage only; no beneficiary API exists yet.

### Not implemented by design

- Admin/operations screens
- Push notifications/background services
- Offline-first synchronization
- Biometric authentication (planned v2)
- Card/USSD/QR/mobile-money flows

## Build

Install the .NET 10 SDK and the MAUI workload on the development machine, then:

```bash
dotnet restore UBee.sln
dotnet build UBee.sln
```

Android and iOS require their normal platform tooling/workloads. iOS builds require a Mac/Xcode environment.

## Backend compatibility note

The supplied backend's current response shapes are used by the app, including:

- wallet: `{ status, data: wallet }`
- transaction history: `{ status, data: [...], nextCursor }`
- transfer: `{ status, message, duplicate, data }`
- KYC: `{ status, data }`

The HTTP layer is centralized so additional endpoints can be added without scattering raw `HttpClient` code through ViewModels.
