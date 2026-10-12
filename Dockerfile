FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

FROM base AS build
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM base AS prod-deps
RUN pnpm install --frozen-lockfile --prod

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
EXPOSE 3000
USER node
CMD ["./node_modules/.bin/react-router-serve", "./build/server/index.js"]
