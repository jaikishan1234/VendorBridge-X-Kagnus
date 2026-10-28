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

export function isImageKitDeliveryUrl(url: string, urlEndpoint: string): boolean {
  try {
    const deliveryUrl = new URL(url);
    const endpointUrl = new URL(urlEndpoint);
    const endpointPath = endpointUrl.pathname.endsWith("/")
      ? endpointUrl.pathname
      : `${endpointUrl.pathname}/`;

    return (
      deliveryUrl.protocol === "https:" &&
      endpointUrl.protocol === "https:" &&
      deliveryUrl.origin === endpointUrl.origin &&
      !deliveryUrl.username &&
      !deliveryUrl.password &&
      !endpointUrl.username &&
      !endpointUrl.password &&
      !endpointUrl.search &&
      !endpointUrl.hash &&
      deliveryUrl.pathname.startsWith(endpointPath)
    );
  } catch {
    return false;
  }
}
