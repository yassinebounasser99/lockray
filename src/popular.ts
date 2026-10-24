/**
 * Widely used npm packages that attackers imitate. A new dependency whose
 * name is one typo away from one of these (and isn't itself on the list) is
 * flagged as a possible typosquat.
 */
export const POPULAR_PACKAGES = new Set([
  "react", "react-dom", "react-router", "react-router-dom", "react-redux", "react-is", "preact", "next", "vue", "vue-router", "vuex",
  "svelte", "angular", "@angular/core", "solid-js", "astro", "nuxt", "gatsby", "remix", "vite", "webpack", "webpack-cli", "rollup",
  "esbuild", "parcel", "babel-loader", "@babel/core", "@babel/preset-env", "typescript", "ts-node", "tsx", "eslint", "prettier",
  "jest", "vitest", "mocha", "chai", "sinon", "cypress", "playwright", "puppeteer", "supertest", "nodemon", "concurrently",
  "express", "koa", "fastify", "hapi", "nestjs", "@nestjs/core", "body-parser", "cookie-parser", "cors", "helmet", "morgan",
  "multer", "compression", "express-session", "passport", "jsonwebtoken", "bcrypt", "bcryptjs", "argon2", "crypto-js",
  "axios", "node-fetch", "got", "request", "superagent", "ky", "undici", "socket.io", "socket.io-client", "ws",
  "lodash", "lodash.merge", "underscore", "ramda", "immer", "immutable", "rxjs", "moment", "dayjs", "date-fns", "luxon",
  "chalk", "colors", "color", "kleur", "picocolors", "commander", "yargs", "minimist", "inquirer", "ora", "boxen", "figlet",
  "debug", "winston", "pino", "bunyan", "dotenv", "cross-env", "config", "uuid", "nanoid", "shortid", "classnames", "clsx",
  "zod", "yup", "joi", "ajv", "validator", "class-validator", "mongoose", "mongodb", "mysql", "mysql2", "pg", "sqlite3",
  "sequelize", "typeorm", "prisma", "@prisma/client", "knex", "redis", "ioredis", "graphql", "apollo-server", "@apollo/client",
  "styled-components", "@emotion/react", "tailwindcss", "postcss", "autoprefixer", "sass", "less", "bootstrap", "jquery",
  "three", "d3", "chart.js", "echarts", "leaflet", "mapbox-gl", "sharp", "jimp", "canvas", "pdfkit", "puppeteer-core",
  "glob", "fast-glob", "rimraf", "mkdirp", "fs-extra", "chokidar", "graceful-fs", "semver", "yaml", "js-yaml", "xml2js",
  "cheerio", "jsdom", "marked", "markdown-it", "highlight.js", "prismjs", "handlebars", "ejs", "pug", "mustache",
  "async", "bluebird", "p-limit", "p-queue", "eventemitter3", "qs", "query-string", "form-data", "mime", "mime-types",
  "electron", "electron-builder", "firebase", "firebase-admin", "aws-sdk", "@aws-sdk/client-s3", "stripe", "twilio",
  "nodemailer", "openai", "@anthropic-ai/sdk", "langchain", "tslib", "core-js", "regenerator-runtime", "@types/node",
  "@types/react", "@types/express", "husky", "lint-staged", "nx", "turbo", "lerna", "zustand", "jotai", "recoil", "redux",
  "@reduxjs/toolkit", "swr", "@tanstack/react-query", "react-hook-form", "formik", "framer-motion", "lucide-react",
  "@mui/material", "antd", "chakra-ui", "@radix-ui/react-dialog", "cross-spawn", "execa", "shelljs", "inherits", "safe-buffer",
  "readable-stream", "string-width", "strip-ansi", "ansi-styles", "supports-color", "has-flag", "ms", "event-stream",
  "ua-parser-js", "coa", "rc", "node-ipc", "colors.js", "faker", "@faker-js/faker",
]);
