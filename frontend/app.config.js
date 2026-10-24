// Extiende app.json con la API key de Google Maps (viene de .env)
const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

/** @param {{ config: import('expo/config').ExpoConfig }} ctx */
module.exports = ({ config }) => ({
  ...config,
  ios: {
    ...config.ios,
    config: { ...config.ios?.config, googleMapsApiKey },
  },
  android: {
    ...config.android,
    config: { ...config.android?.config, googleMaps: { apiKey: googleMapsApiKey } },
  },
  plugins: [
    ...(config.plugins ?? []),
    [
      "react-native-maps",
      {
        iosGoogleMapsApiKey: googleMapsApiKey,
        androidGoogleMapsApiKey: googleMapsApiKey,
      },
    ],
  ],
});
