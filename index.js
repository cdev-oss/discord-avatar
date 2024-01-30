require("dotenv/config");

const PORT = process.env.PORT;
const ms = require("ms");
const { customAvatarRoute, defaultAvatarRoute } = require('./util');
const { fetch } = require("undici");

// cache
const cache = new Map();

const Express = require('express');
const app = new Express();

// basic security
const helmet = require("helmet");
app.use(helmet({
  crossOriginResourcePolicy: {
    policy: "cross-origin"
  }
}));

// ratelimiter
const ipAddresses = new Map();
const rateLimitThreshold = 25;

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

  if (!ipAddresses.has(currentRequestIP)) {
    ipAddresses.set(currentRequestIP, 1);
    setTimeout(() => ipAddresses.delete(currentRequestIP), ms("1m"));
  } else {
    const currentCost = ipAddresses.get(currentRequestIP);
    if (currentCost > rateLimitThreshold) {
      return res.sendStatus(429);
    };

    ipAddresses.set(currentRequestIP, currentCost + 1);
  };

  try {
    const fixedTimeCache = ms("1h");

    let avatar = cache.has(userID) ? cache.get(userID) : null;
    if (!avatar) {
      const userRequest = await fetch("https://discord.com/api/v10/users/" + userID, {
        method: "GET",
        headers: {
          Authorization: `Bot ${process.env.DISCORD_TOKEN}`
        }
      });

      if (userRequest.status >= 400) {
        return res.status(500).send(`received ${userRequest.status} while fetching user's avatar`);
      };

      const user = await userRequest.json();
      if (!user?.id) {
        return res.status(500).send("received nothing after parsing user's avatar request");
      };

      const rawAvatar = user?.avatar || "";

      cache.set(user.id, rawAvatar);
      setTimeout(() => cache.delete(user.id), fixedTimeCache);

      avatar = rawAvatar;
    };

    const avatarURL = avatar?.length ? customAvatarRoute(userID, avatar, req?.query?.size, req?.query?.type) : defaultAvatarRoute(userID);
    const rawImageFetch = await fetch(avatarURL, { method: "GET" });
    if (rawImageFetch.status !== 200) {
      console.error(`[${rawImageFetch.status}] ${userID}/${avatar}`, await rawImageFetch.text());
      return res.status(400).send("unable to fetch Discord avatar momentarily");
    };

    return res.set("content-type", rawImageFetch?.headers?.get("content-type")).send(Buffer.from(await rawImageFetch.arrayBuffer()));
  } catch (error) {
    console.error(error);
    return res.sendStatus(502);
  };
});

app.listen(PORT, async () => {
  return console.log(`Avatar: Ready, with port [${PORT}]`);
});