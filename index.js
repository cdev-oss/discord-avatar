require("dotenv/config");

const PORT = process.env.PORT;
const ms = require("ms");
const { cacheKey, customAvatarRoute, defaultAvatarRoute } = require('./util');

// redis
const { Redis } = require("ioredis");
const redis = new Redis({
  port: process.env.REDIS_PORT,
  host: process.env.REDIS_HOST,
  username: process.env.REDIS_USERNAME,
  password: process.env.REDIS_PASS,
});

redis.on("ready", () => console.log("Redis: Ready."));

const Express = require('express');
const app = new Express();

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
const ipAddresses = {};

// request ip
const requestIp = require("request-ip");

// ignore favicon
app.get("/favicon.ico", (_, res) => res.setHeader("Cache-Control", `public, max-age=${Math.round(ms("30d") / 1000)}`).sendStatus(204));

app.get("/", (_, res) => res.redirect(301, "https://github.com/cdev-oss/discord-avatar"))

app.get("/:userid", async (req, res) => {
  const userID = req.params?.userid;
  if (!userID) {
    return res.status(400).send("user ID is required.");
  };

  if (isNaN(userID) || !userID.match(/\d{17,21}/gi)) {
    return res.sendStatus(400);
  };

  // ratelimiting check
  const currentRequestIP = requestIp.getClientIp(req);
  if (!currentRequestIP?.length) {
    return res.sendStatus(403);
  };

  if (ipAddresses?.[currentRequestIP] > 2) {
    return res.sendStatus(429);
  };

  if (!ipAddresses?.[currentRequestIP]) {
    ipAddresses[currentRequestIP] = 1;
    setTimeout(() => delete ipAddresses[currentRequestIP], ms("1m"));
  } else {
    ipAddresses[currentRequestIP]++;
  };

  try {
    const fixedTimeCache = ms("1h");
    const cacheValue = `public, max-age=${Math.round(fixedTimeCache / 1000)}`;

    const cachedAvatarHash = await redis.exists(cacheKey(userID));
    if (cachedAvatarHash === 1) {
      const avatarValue = await redis.get(cacheKey(userID));
      
      return res.setHeader("Cache-Control", cacheValue).redirect(
        avatarValue?.length ?
        customAvatarRoute(userID, avatarValue, req?.query?.size, req?.query?.type) : 
        defaultAvatarRoute(userID)
      );
    };
    
    const user = await client.rest.users.get(userID).catch(() => {});
    if (!user?.id) {
      return res.sendStatus(404);
    };

    const avatar = user?.avatar || "";

    await redis.set(cacheKey(user.id), avatar, "EX", Math.round(fixedTimeCache / 1000));

    return res.setHeader("Cache-Control", cacheValue).redirect(
      avatar?.length ?
      customAvatarRoute(user.id, avatar, req?.query?.size, req?.query?.type) :
      defaultAvatarRoute(userID)
    );
  } catch (error) {
    console.error(error);
    return res.sendStatus(502);
  };
});

app.listen(PORT, async () => {
  client = await client.restMode(false);
  
  client
  .on("error", (error) => console.error(error))
  .on("warn", (message) => console.warn(message));

  return console.log(`Avatar: Ready, with port [${PORT}]`)
});