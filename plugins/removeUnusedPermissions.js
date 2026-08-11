const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS_TO_REMOVE = ['android.permission.ACTIVITY_RECOGNITION'];

module.exports = function removeUnusedPermissions(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    if (!manifest.manifest) return config;

    const usesPermission = manifest.manifest['uses-permission'];
    const perms = Array.isArray(usesPermission) ? usesPermission : [];

    manifest.manifest['uses-permission'] = perms.filter(
      (perm) => !PERMISSIONS_TO_REMOVE.includes(perm.$ && perm.$['android:name'])
    );

    manifest.manifest.$ = manifest.manifest.$ || {};
    manifest.manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    for (const name of PERMISSIONS_TO_REMOVE) {
      manifest.manifest['uses-permission'].push({
        $: {
          'android:name': name,
          'tools:node': 'remove',
        },
      });
    }
    return config;
  });
};
