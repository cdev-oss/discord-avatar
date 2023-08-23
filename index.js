require("dotenv").config();
// const app = require("express")();
const PORT = process.env.PORT;
const cachedHash = new Map();
const ms = require("ms");

const HyperExpress = require('hyper-express');
const app = new HyperExpress.Server();

// rest
const {Client} = require("eris");
const client = new Client(`Bot ${process.env.DISCORD_TOKEN}`, { restMode: true });

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
const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
const endpoint = (userID, hash, size) => `https://cdn.discordapp.com/avatars/${userID}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size && !isNaN(size) && powerOfTwo(size) ? size : 4096}`;

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

  const cacheValue = `public, max-age=${Math.round(ms("24h") / 1000)}`;

  if (cachedHash.has(userID)) {
    const avatarValue = cachedHash.get(userID);
    return res.header("Cache-Control", cacheValue).redirect(avatarValue !== null ? endpoint(userID, cachedHash.get(userID), req.query.size) : defaultAvatar)
  } else {
    try {
      const user = await client.getRESTUser(userID).catch(() => {});
      if (!user) {
        return res.sendStatus(404);
      };
      
      if (!user.avatar) {
        cachedHash.set(user.id, null);

        res.redirect(defaultAvatar);

        setTimeout(() => cachedHash.delete(user.id), ms("15m"));

        return;
      };

      res.header("Cache-Control", cacheValue).redirect(endpoint(userID, user.avatar, req.query.size));

      cachedHash.set(user.id, user.avatar);

      setTimeout(() => cachedHash.delete(user.id), ms("1h"));

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

(async () => {
  await app.listen(PORT);

  return console.log(`Avatar: Ready, with port [${PORT}]`);
})();