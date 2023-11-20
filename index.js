require("dotenv").config();
const PORT = process.env.PORT;
const ms = require("ms");

// redis
const { Redis } = require("ioredis");
const redis = new Redis({
  port: process.env.REDIS_PORT,
  host: process.env.REDIS_HOST,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASS,
});

redis.on("ready", () => console.log("Redis: Ready."));

const HyperExpress = require('hyper-express');
const app = new HyperExpress.Server();

// rest
const { Client } = require("oceanic.js");
let client = new Client({ auth: `Bot ${process.env.DISCORD_TOKEN}` });

// basic security
const helmet = require("helmet");
app.use(helmet({
  crossOriginResourcePolicy: {
    policy: "cross-origin"
  }
}));

// ratelimiter
const {RateLimiterMemory} = require("rate-limiter-flexible");
const rateLimiter = new RateLimiterMemory({ points: 6, duration: 7.5 });

// ignore favicon
app.get("/favicon.ico", (_, res) => res.sendStatus(204));

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

const cacheKey = (userID) => `cached-discord-avatar-${userID}`;

const customAvatarRoute = (userID, hash, size, extension) => `https://cdn.discordapp.com/avatars/${userID}/${hash}.${extensionLogic(hash, extension)}?size=${sizeLogic(size)}`;

const defaultAvatarRoute = (userID) => {
  const mod = userID ? (userID >> 22) % 6 : 0;
  return `https://cdn.discordapp.com/embed/avatars/${mod}.png`;
};

app.get("/", (_, res) => res.redirect("https://github.com/cdev-oss/discord-avatar"))

app.set_error_handler((req, res, error) => {
  console.error(error);
  return res.sendStatus(502);
})

app.get("/:userid", async (req, res) => {
  const userID = req.params?.userid;
  if (!userID) {
    return res.status(400).send("user ID is required.");
  };

  if (isNaN(userID) || !userID.match(/\d{17,21}/gi)) {
    return res.sendStatus(400);
  };

  const fixedTimeCache = ms("1h");
  const cacheValue = `public, max-age=${Math.round(fixedTimeCache / 1000)}`;

  try {
    await rateLimiter.consume(getIP(req), 1);
  } catch {
    return res.sendStatus(429);
  };

  const cachedAvatarHash = await redis.exists(cacheKey(userID));
  if (cachedAvatarHash === 1) {
    const avatarValue = await redis.get(cacheKey(userID));
    
    return res.header("Cache-Control", cacheValue).redirect(avatarValue?.length ? customAvatarRoute(userID, avatarValue, req?.query?.size, req?.query?.type) : defaultAvatarRoute(userID));
  } else {
    try {
      const user = await client.rest.users.get(userID).catch(() => {});
      if (!user?.id) {
        return res.sendStatus(404);
      };

      const avatar = user?.avatar || "";

      await redis.set(cacheKey(user.id), avatar, "EX", Math.round(fixedTimeCache / 1000));

      return res.header("Cache-Control", cacheValue).redirect(avatar ? customAvatarRoute(user.id, avatar, req?.query?.size, req?.query?.type) : defaultAvatarRoute(userID));
    } catch (error) {
      console.error(error);
      return res.sendStatus(502);
    };
  };
});

function getIP(req) {
  return String(req.headers['cf-connecting-ip'] || "") ||
    String(req.headers['x-forwarded-for'] || "").replace(/:\d+$/, '') ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;
};

async function startServer() {
  client = await client.restMode(false);
  

  client
  .on("error", (error) => console.error(error))
  .on("warn", (message) => console.warn(message));

  await app.listen(PORT);

  return console.log(`Avatar: Ready, with port [${PORT}]`);
};

startServer();