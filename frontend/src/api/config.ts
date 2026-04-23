import { NativeModules, Platform } from 'react-native';

const DEFAULT_API_PORT = '8000';
const DEFAULT_API_PATH = '/api';
const DEFAULT_NATIVE_HOST = '127.0.0.1';
const DEFAULT_ANDROID_EMULATOR_HOST = '10.0.2.2';
const AUTO_API_URL_VALUES = new Set(['auto', 'default']);
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost']);

type AndroidPlatformConstants = {
  Brand?: string;
  Fingerprint?: string;
  Manufacturer?: string;
  Model?: string;
  ServerHost?: string;
};

const sanitizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '');
const isLoopbackHost = (value?: string | null) => LOOPBACK_HOSTS.has(value?.trim().toLowerCase() ?? '');
const parseHost = (value?: string | null) => {
  const sanitizedValue = value?.trim();
  if (!sanitizedValue) {
    return null;
  }

  const protocolMatch = sanitizedValue.match(/^[a-z]+:\/\/([^/:?#]+)/i);
  if (protocolMatch?.[1]) {
    return protocolMatch[1];
  }

  return sanitizedValue.replace(/:\d+$/, '');
};

const sanitizeHost = (value?: string | null) => {
  const sanitizedHost = parseHost(value);
  if (!sanitizedHost) {
    return null;
  }

  if (isLoopbackHost(sanitizedHost)) {
    return null;
  }

  return sanitizedHost;
};

const normalizeApiPath = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_API_PATH;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const inferHostFromWebLocation = () => {
  if (Platform.OS !== 'web') {
    return null;
  }

  return sanitizeHost(globalThis.location?.hostname);
};

const getBundleScriptUrl = () =>
  (NativeModules as { SourceCode?: { scriptURL?: string } }).SourceCode?.scriptURL;

const inferHostFromBundleUrl = () => {
  const scriptUrl = getBundleScriptUrl();

  if (!scriptUrl) {
    return null;
  }

  return sanitizeHost(parseHost(scriptUrl));
};

const inferHostFromExpoPublicEnv = () =>
  sanitizeHost(process.env.EXPO_PUBLIC_DEV_SERVER_HOST);

const isAndroidEmulator = () => {
  if (Platform.OS !== 'android') {
    return false;
  }

  const androidConstants = Platform.constants as typeof Platform.constants &
    AndroidPlatformConstants;

  const fingerprint = androidConstants.Fingerprint?.toLowerCase() ?? '';
  const model = androidConstants.Model?.toLowerCase() ?? '';
  const brand = androidConstants.Brand?.toLowerCase() ?? '';
  const manufacturer = androidConstants.Manufacturer?.toLowerCase() ?? '';

  return (
    fingerprint.startsWith('generic') ||
    fingerprint.startsWith('unknown') ||
    model.includes('google_sdk') ||
    model.includes('emulator') ||
    model.includes('android sdk built for x86') ||
    model.includes('sdk_gphone') ||
    manufacturer.includes('genymotion') ||
    brand.startsWith('generic')
  );
};

const inferHostFromAndroidServerHost = () => {
  if (Platform.OS !== 'android') {
    return null;
  }

  const androidConstants = Platform.constants as typeof Platform.constants &
    AndroidPlatformConstants;

  return sanitizeHost(androidConstants.ServerHost);
};

const inferLoopbackFallbackHost = () => {
  if (Platform.OS === 'android' && isAndroidEmulator()) {
    return DEFAULT_ANDROID_EMULATOR_HOST;
  }

  if (Platform.OS === 'web') {
    return isLoopbackHost(globalThis.location?.hostname) ? DEFAULT_NATIVE_HOST : null;
  }

  return isLoopbackHost(parseHost(getBundleScriptUrl())) ? DEFAULT_NATIVE_HOST : null;
};

const buildApiBaseUrl = (host: string) => {
  const apiPort = process.env.EXPO_PUBLIC_API_PORT?.trim() || DEFAULT_API_PORT;
  const apiPath = normalizeApiPath(
    process.env.EXPO_PUBLIC_API_PATH?.trim() || DEFAULT_API_PATH
  );

  return `http://${host}:${apiPort}${apiPath}`;
};

const resolveConfiguredUrl = () => {
  const configuredUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!configuredUrl) {
    return null;
  }

  const sanitizedUrl = sanitizeBaseUrl(configuredUrl);
  const normalizedUrl = sanitizedUrl.toLowerCase();
  if (
    AUTO_API_URL_VALUES.has(normalizedUrl) ||
    normalizedUrl.includes('your_pc_lan_ip')
  ) {
    return null;
  }

  return sanitizedUrl;
};

const appendHost = (hosts: string[], host: string | null) => {
  if (!host || hosts.includes(host)) {
    return;
  }

  hosts.push(host);
};

const resolveAutoDetectedHosts = () => {
  const hosts: string[] = [];

  appendHost(hosts, inferHostFromWebLocation());

  if (hosts.length > 0) {
    return hosts;
  }

  if (isAndroidEmulator()) {
    appendHost(hosts, DEFAULT_ANDROID_EMULATOR_HOST);
  }

  appendHost(hosts, inferHostFromExpoPublicEnv());
  appendHost(hosts, inferHostFromAndroidServerHost());
  appendHost(hosts, inferHostFromBundleUrl());
  appendHost(hosts, inferLoopbackFallbackHost());

  return hosts;
};

export const hasConfiguredApiBaseUrl = () => Boolean(resolveConfiguredUrl());

export const getApiBaseUrlCandidates = () => {
  const configuredUrl = resolveConfiguredUrl();
  if (configuredUrl) {
    return [configuredUrl];
  }

  return resolveAutoDetectedHosts().map(buildApiBaseUrl);
};

export const resolveApiBaseUrl = () => {
  return getApiBaseUrlCandidates()[0] ?? buildApiBaseUrl(DEFAULT_NATIVE_HOST);
};

export const API_BASE_URL = resolveApiBaseUrl();

const toHealthCheckUrl = (baseUrl: string) => `${sanitizeBaseUrl(baseUrl)}/health/`;

const pickHealthCheckUrl = (baseUrls: string[]) => {
  const preferredBaseUrl =
    baseUrls.find((baseUrl) => !isLoopbackHost(parseHost(baseUrl))) ?? baseUrls[0];

  return preferredBaseUrl ? toHealthCheckUrl(preferredBaseUrl) : null;
};

export const getApiConnectionHelp = (baseUrls: string[] = []) => {
  const hints = ['Make sure Django is running on 0.0.0.0:8000.'];
  const healthCheckUrl = pickHealthCheckUrl(baseUrls);

  if (healthCheckUrl) {
    hints.push(
      `Open ${healthCheckUrl} in the same device browser. If it does not load, the device cannot reach your computer yet.`
    );
  }

  if (Platform.OS === 'android') {
    if (isAndroidEmulator()) {
      hints.push('Android emulator auto mode uses 10.0.2.2 instead of the Expo LAN IP.');
    } else {
      hints.push(
        'On a real Android device, use the same Wi-Fi or hotspot as your computer, then allow Python or port 8000 through Windows Firewall if needed.'
      );
    }
  }

  if (Platform.OS === 'ios') {
    hints.push(
      'On iPhone, the app must use your computer LAN IP and the same Wi-Fi or hotspot connection.'
    );
  }

  if (Platform.OS !== 'web') {
    hints.push(
      'Leave EXPO_PUBLIC_API_URL unset or set it to auto for local development. You can still set a fixed LAN URL if needed.'
    );
    hints.push('Restart Expo after switching Wi-Fi or hotspot networks.');
  }

  hints.push('Use HTTPS in production, or allow cleartext HTTP only for local development builds.');

  return hints.join(' ');
};
