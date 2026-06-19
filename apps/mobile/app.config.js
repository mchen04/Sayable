const webBaseUrl = process.env.EXPO_PUBLIC_WEB_BASE_URL || "http://localhost:3000";
const webHost = new URL(webBaseUrl).hostname;

module.exports = {
  expo: {
    name: "Sayable",
    slug: "sayable",
    scheme: "sayable",
    version: "0.1.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#fbf8f2"
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.sayable.mvp",
      associatedDomains: [`applinks:${webHost}`]
    },
    android: {
      package: "com.sayable.mvp",
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: webHost,
              pathPrefix: "/c"
            }
          ],
          category: ["BROWSABLE", "DEFAULT"]
        }
      ]
    },
    web: {
      bundler: "metro",
      favicon: "../web/public/favicon.svg"
    },
    plugins: ["expo-router", "expo-secure-store"],
    experiments: {
      typedRoutes: true
    }
  }
};
