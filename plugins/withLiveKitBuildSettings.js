const { withPodfileProperties } = require('expo/config-plugins');

const withLiveKitBuildSettings = (config) => {
    return withPodfileProperties(config, (config) => {
        // Ensure we have a properties object
        config.modResults = config.modResults || {};

        // This is a way to inject arbitrary podfile code in Expo
        // However, expo-build-properties is better for static properties.
        // For post_install hooks, we often need 'withDangerousMod' or 'withPodfile'.
        // Let's use the standard 'expo-build-properties' pattern via ios.podfileProperties if possible
        // But CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES is a build setting, not a podfile property.
        return config;
    });
};

// Actually, we need 'withPodfile' to append the post_install hook.
const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withLiveKitPodfilePatch = (config) => {
    return withDangerousMod(config, [
        'ios',
        async (config) => {
            const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

            if (!fs.existsSync(podfilePath)) {
                // Did not run prebuild yet, or not managed
                return config;
            }

            let podfileContent = fs.readFileSync(podfilePath, 'utf-8');

            // The patch to allowing non-modular includes
            // We look for the post_install block or append one.
            // Expo's Podfile usually has a post_install.

            const patch = `
    installer.pods_project.targets.each do |target|
      if ['livekit-react-native', 'WebRTC-SDK', 'livekit_react_native_webrtc'].include? target.name
        target.build_configurations.each do |config|
          config.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
        end
      end
    end
`;

            // Simpler approach: Just search for the end of the post_install block provided by Expo
            // But purely appending to end of Podfile is risky if Expo wraps it.

            // SAFE APPROACH: Expo's Podfile ends with the post_install hook.
            // We can use the 'expo-build-properties' plugin to set 'ios.podfileProperties'? No, that's for variables.

            // Let's replace the common "post_install do |installer|" block or just append it to the existing loop if we can find it.
            // However, modifying the Podfile directly with regex is brittle.

            // BETTER: config-plugins/react-native-webrtc might already handle this? No.

            // Let's use the standard Expo pattern for appending to Podfile:
            if (!podfileContent.includes("CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES")) {
                // We insert our logic inside the existing post_install block if possible, 
                // or we can add a pre_install or just add it to the end if we are careful.
                // Expo's template usually has `post_install do |installer|` ... `react_native_post_install(installer)` ... `end`

                // We will use a smart replace to locate the inside of the post_install block.
                const postInstallMatch = podfileContent.match(/post_install do \|installer\|/);
                if (postInstallMatch) {
                    // Insert right after the opening line
                    const insertionInfo = postInstallMatch[0] + patch;
                    podfileContent = podfileContent.replace(postInstallMatch[0], insertionInfo);
                    fs.writeFileSync(podfilePath, podfileContent);
                }
            }
            return config;
        },
    ]);
};

module.exports = withLiveKitPodfilePatch;
