const os = require('os');
const { spawn } = require('child_process');

const PRIVATE_IP_PATTERNS = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

const PREFERRED_INTERFACE_PATTERNS = [/wi-?fi/i, /wlan/i, /ethernet/i, /^en/i, /^eth/i];
const DEPRIORITIZED_INTERFACE_PATTERNS = [
  /loopback/i,
  /virtual/i,
  /vmware/i,
  /hyper-v/i,
  /vethernet/i,
  /docker/i,
  /wsl/i,
  /bluetooth/i,
  /tunnel/i,
  /local area connection\*/i,
];

const isPrivateIpv4 = (address) =>
  PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(address));

const isDeprioritizedInterface = (name) =>
  DEPRIORITIZED_INTERFACE_PATTERNS.some((pattern) => pattern.test(name));

const getInterfacePriority = (name) => {
  const matchIndex = PREFERRED_INTERFACE_PATTERNS.findIndex((pattern) => pattern.test(name));
  return matchIndex === -1 ? PREFERRED_INTERFACE_PATTERNS.length : matchIndex;
};

const pickLanIp = () => {
  const candidates = [];

  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.internal || address.family !== 'IPv4') {
        continue;
      }

      candidates.push({
        name,
        address: address.address,
        deprioritized: isDeprioritizedInterface(name),
        private: isPrivateIpv4(address.address),
      });
    }
  }

  candidates.sort((left, right) => {
    if (left.deprioritized !== right.deprioritized) {
      return left.deprioritized ? 1 : -1;
    }

    if (left.private !== right.private) {
      return left.private ? -1 : 1;
    }

    return getInterfacePriority(left.name) - getInterfacePriority(right.name);
  });

  return candidates[0] ?? null;
};

const lanIp = pickLanIp();
const env = { ...process.env };
const isWindows = process.platform === 'win32';

if (lanIp) {
  env.REACT_NATIVE_PACKAGER_HOSTNAME = lanIp.address;
  env.EXPO_PUBLIC_DEV_SERVER_HOST = lanIp.address;
} else {
  console.log('[start-expo] No LAN IP detected. Expo will choose the host automatically.');
}

const child = spawn(
  'npx',
  ['expo', 'start', '--lan', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    env,
    shell: isWindows,
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});
