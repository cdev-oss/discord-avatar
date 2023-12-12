const powerOfTwo = (n) => Math.log2(n) % 1 === 0;

const sizeLogic = (size) => {
  return (!size || isNaN(size) || !powerOfTwo(size)) ? 4096 : size;
};

const extensionLogic = (hash, type) => {
  const supportedType = ["png", "jpeg", "jpg", "webp", "gif"];
  
  if (!type?.length || !supportedType?.includes(type?.toLowerCase())) {
    if (!hash?.length) {
      return "png";
    };

    return hash.startsWith("a_") ? "gif" : "png";
  };

  return type;
};

module.exports.customAvatarRoute = (userID, hash, size, extension) => `https://cdn.discordapp.com/avatars/${userID}/${hash}.${extensionLogic(hash, extension)}?size=${sizeLogic(size)}`;

module.exports.defaultAvatarRoute = (userID) => {
  const mod = userID ? (userID >> 22) % 6 : 0;
  return `https://cdn.discordapp.com/embed/avatars/${mod}.png`;
};