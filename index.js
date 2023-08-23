require("dotenv").config();
// const app = require("express")();
const PORT = process.env.PORT;
const cachedAvatarURL = new Map();
const ms = require("ms");

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
app.use(async (req, res, next) => {
  try {
    await rateLimiter.consume(getIP(req), 1);
  } catch {
    return res.sendStatus(429);
  };

  next();
});

// ignore favicon
app.get("/favicon.ico", (_, res) => res.sendStatus(204));

const powerOfTwo = (n) => Math.log2(n) % 1 === 0;
const customAvatarRoute = (userID, hash, size) => `https://cdn.discordapp.com/avatars/${userID}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size && !isNaN(size) && powerOfTwo(size) ? size : 4096}`;

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

  if (cachedAvatarURL.has(userID)) {
    const avatarValue = cachedAvatarURL.get(userID);
    return res.header("Cache-Control", cacheValue).redirect(avatarValue)
  } else {
    try {
      const user = await client.rest.users.get(userID).catch(() => {});
      if (!user?.id) {
        return res.sendStatus(404);
      };

      const avatar = user?.avatar ? customAvatarRoute(user.id, user.avatar, req?.query?.size) : user.defaultAvatarURL();

      res.header("Cache-Control", cacheValue).redirect(avatar);

      cachedAvatarURL.set(user.id, avatar);

      setTimeout(() => cachedAvatarURL.delete(user.id), fixedTimeCache);

      return;
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