const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS_TO_REMOVE = ['android.permission.ACTIVITY_RECOGNITION'];

module.exports = function removeUnusedPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    const usesPermissions = manifest.manifest['uses-permission'];
    if (usesPermissions && Array.isArray(usesPermissions)) {
      config.modResults.manifest['uses-permission'] = usesPermissions.filter(
        (perm) => !PERMISSIONS_TO_REMOVE.includes(perm.$ && perm.$['android:name'])
      );
    }
    return config;
  });
};
