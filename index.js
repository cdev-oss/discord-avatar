require("dotenv").config();
const app = require("express")();
const PORT = process.env.PORT;
const cachedHash = new Map();
const ms = require("ms");

// rest
const {Client} = require("eris");
const client = new Client(`Bot ${process.env.DISCORD_TOKEN}`, { restMode: true });

// basic security
const helmet = require("helmet");
app.use(helmet());

// ratelimiter
const {RateLimiterMemory} = require("rate-limiter-flexible");
const rateLimiter = new RateLimiterMemory({ points: 6, duration: 7.5 });
app.use((req, res, next) => {
  consume = rateLimiter.consume(getIP(req), 1)
  .then(next())
  .catch(() => {
    return res.sendStatus(429);
  });
});

// ignore favicon
app.get("/favicon.ico", (_, res) => res.sendStatus(204));

const powerOfTwo = (n) => Math.log2(n) % 1 === 0;
const defaultAvatar = "https://cdn.discordapp.com/embed/avatars/0.png";
const endpoint = (userID, hash, size) => `https://cdn.discordapp.com/avatars/${userID}/${hash}.${hash.startsWith("a_") ? "gif" : "png"}?size=${size && !isNaN(size) && powerOfTwo(size) ? size : 4096}`;

app.get(["/", "/:userid"], async (req, res) => {
  const userID = req.params?.userid;
  if (!userID) {
    return res.sendStatus(200);
  };

  if (isNaN(userID) || !userID.match(/\d{17,21}/gi)) {
    return res.sendStatus(400);
  };

  if (cachedHash.has(userID)) {
    const avatarValue = cachedHash.get(userID);
    return res.redirect(avatarValue !== null ? endpoint(userID, cachedHash.get(userID), req.query.size) : defaultAvatar)
  } else {
    try {
      const user = await client.getRESTUser(userID);
      if (!user) return res.sendStatus(404);

      res.redirect(endpoint(userID, user.avatar, req.query.size));

      cachedHash.set(user.id, user.avatar);

      // cache this for an hour
      setTimeout(() => cachedHash.delete(user.id), ms("1h"));

      return;
    } catch (error) {
      console.error(error);
      return res.sendStatus(502);
    };
  };
});

app.listen(PORT, () => {
  console.log(`Avatar: Ready, with port [${PORT}]`);
});

function getIP(req) {
  return String(req.headers['cf-connecting-ip'] || "") ||
    String(req.headers['x-forwarded-for'] || "").replace(/:\d+$/, '') ||
    req.ip ||
    req.connection.remoteAddress ||
    req.socket.remoteAddress;
};