const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
	dir: './out/electron',
	asar: true,
    executableName: "CopyCart",
    icon: "build/icons/icon.ico",
	extraResources: [
      {
        from: 'dist',
        to: 'dist',
        filter: ['**/*']
      }
  	],
	extraResource: ['dist']
  },
  rebuildConfig: {},
   makers: [
    {
      name: "@electron-forge/maker-squirrel",
      platforms: ["win32"],
      config: {
        name: "CopyCart",
        authors: "Dennis Bogdanov",
        exe: "CopyCart.exe",
        setupExe: "CopyCartInstaller.exe",
        setupIcon: "build/icons/icon.ico",
        description: "Copy files based on order imports",
        loadingGif: "build/install.gif",
        noMsi: true,
      },
	},
    {
      name: "@electron-forge/maker-zip",
      platforms: ["win32"],
      config: {
        name: "CopyCart",
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
