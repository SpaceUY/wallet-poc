import { ConfigContext, ExpoConfig } from "expo/config";

const EAS_PROJECT_ID = "a4a61df6-7312-4dcf-934a-d35ec1427f9c";
const PROJECT_SLUG = "wallet-poc";
const OWNER = "spaceuy";

// App production config
const APP_NAME = "Wallet POC";
const BUNDLE_IDENTIFIER = "com.space.wallet-poc";
const PACKAGE_NAME = "com.space.walletpoc";
const ICON = "./assets/images/icons/iOS-Prod.png";
const ADAPTIVE_ICON = "./assets/images/icons/Android-Prod.png";
const SCHEME = "app-scheme";

export default ({ config }: ConfigContext): ExpoConfig => {
  const appEnv = process.env.APP_ENV || "development";
  console.log("⚙️ Building app for environment:", appEnv);
  const { name, bundleIdentifier, icon, adaptiveIcon, packageName, scheme } =
    getDynamicAppConfig(
      (appEnv as "development" | "preview" | "production")
    );

  return {
    ...config,
    name: name,
    version: "1.0.3",
    slug: PROJECT_SLUG, // Must be consistent across all environments.
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    icon: icon,
    scheme: scheme,
    ios: {
      supportsTablet: true,
      bundleIdentifier: bundleIdentifier,
      config: {
        usesNonExemptEncryption: false
      },
      entitlements: {
        "keychain-access-groups": [
          "$(AppIdentifierPrefix)com.space.wallet-poc"
        ],
        "com.apple.developer.default-data-protection": "NSFileProtectionComplete"
      },
      infoPlist: {
        NSFaceIDUsageDescription: "This app uses Face ID to securely authenticate wallet access and transactions.",
        NSLocalNetworkUsageDescription: "This app may access your local network to connect to blockchain nodes.",
        ITSAppUsesNonExemptEncryption: false
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: adaptiveIcon,
        backgroundColor: "#ffffff",
      },
      package: packageName,
    },
    updates: {
      url: `https://u.expo.dev/${EAS_PROJECT_ID}`,
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    extra: {
      eas: {
        projectId: EAS_PROJECT_ID,
      },
    },
    web: {
      bundler: "metro",
      output: "static",
      favicon: "./assets/images/favicon.png",
    },
    plugins: [
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/images/splash-icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
      [
        "expo-secure-store",
        {
          faceIDPermission: "Allow $(PRODUCT_NAME) to access your biometric data for secure wallet authentication."
        }
      ],
      "./plugins/SecureWalletPlugin.js"
    ],
    experiments: {
      typedRoutes: true,
    },
    owner: OWNER,
  };
};

// Dynamically configure the app based on the environment.
export const getDynamicAppConfig = (
  environment: "development" | "preview" | "production"
) => {
  if (environment === "production") {
    return {
      name: APP_NAME,
      bundleIdentifier: BUNDLE_IDENTIFIER,
      packageName: PACKAGE_NAME,
      icon: ICON,
      adaptiveIcon: ADAPTIVE_ICON,
      scheme: SCHEME,
    };
  }

  if (environment === "preview") {
    return {
      name: `${APP_NAME} Preview`,
      bundleIdentifier: `${BUNDLE_IDENTIFIER}.preview`,
      packageName: `${PACKAGE_NAME}.preview`,
      icon: "./assets/images/icons/iOS-Prev.png",
      adaptiveIcon: "./assets/images/icons/Android-Prev.png",
      scheme: `${SCHEME}-prev`,
    };
  }

  return {
    name: `${APP_NAME} Development`,
    bundleIdentifier: `${BUNDLE_IDENTIFIER}.dev`,
    packageName: `${PACKAGE_NAME}.dev`,
    icon: "./assets/images/icons/iOS-Dev.png",
    adaptiveIcon: "./assets/images/icons/Android-Dev.png",
    scheme: `${SCHEME}-dev`,
  };
};

