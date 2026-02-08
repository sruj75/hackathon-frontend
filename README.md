# Intentive Frontend

React Native (Expo) mobile application for the Intentive AI Accountability Coach.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Copy environment variables:
```bash
cp .env.example .env
```

3. Fill in your backend URL in `.env`:
   - `EXPO_PUBLIC_BACKEND_URL` - Your Vercel or local backend URL (e.g., `http://localhost:3000/api`)
   - `EXPO_PUBLIC_SINGLE_USER_ID` - Single account ID used across this personal/testing app

4. (Optional) Install EAS CLI for builds:
```bash
npm install -g eas-cli
```

## Development

Run locally:
```bash
npx expo start
```

Press **i** for iOS simulator, **a** for Android emulator, or scan the QR code with the Expo Go app.

## Build and Deploy

This project uses [Expo Application Services (EAS)](https://expo.dev/eas) for builds.

### Build for iOS
```bash
eas build --platform ios
```

### Build for Android
```bash
eas build --platform android
```

### Submit to App Store / Play Store
```bash
eas submit --platform ios
eas submit --platform android
```

## Tech Stack

- **Framework:** [Expo](https://expo.dev/) / [React Native](https://reactnative.dev/)
- **Navigation:** [Expo Router](https://docs.expo.dev/router/introduction/)
- **Real-time Audio:** [LiveKit SDK](https://livekit.io/)
- **Styling:** React Native Stylesheets
