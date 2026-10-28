import ImageKit from "@imagekit/nodejs";

function requireImageKitSetting(name: "IMAGEKIT_PRIVATE_KEY" | "IMAGEKIT_PUBLIC_KEY" | "IMAGEKIT_URL_ENDPOINT") {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export function getImageKitClient() {
  return new ImageKit({
    privateKey: requireImageKitSetting("IMAGEKIT_PRIVATE_KEY"),
  });
}

export function getImageKitPublicKey() {
  return requireImageKitSetting("IMAGEKIT_PUBLIC_KEY");
}

export function getImageKitUrlEndpoint() {
  return requireImageKitSetting("IMAGEKIT_URL_ENDPOINT");
}
