const { withAndroidManifest } = require('@expo/config-plugins');

const PERMISSIONS_TO_REMOVE = ['android.permission.ACTIVITY_RECOGNITION'];

const ACTIVITIES_ORIENTATION_UNSPECIFIED = [
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity',
];

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

    const application = manifest.manifest['application'];
    if (application && Array.isArray(application)) {
      const activities = application[0] && application[0]['activity'];
      if (activities && Array.isArray(activities)) {
        for (const activity of activities) {
          const name = activity.$ && activity.$['android:name'];
          if (ACTIVITIES_ORIENTATION_UNSPECIFIED.includes(name)) {
            activity.$['android:screenOrientation'] = 'unspecified';
          }
        }
        for (const name of ACTIVITIES_ORIENTATION_UNSPECIFIED) {
          application[0]['activity'].push({
            $: {
              'android:name': name,
              'android:screenOrientation': 'unspecified',
              'tools:replace': 'android:screenOrientation',
            },
          });
        }
      }
    }

    return config;
  });
};
