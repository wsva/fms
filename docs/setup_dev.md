## Create project from scratch

`````
docker pull node:24.12.0
docker run -it --user node --name next.js -v /home/yanan/code/wsva/fms:/code node:24.12.0 /bin/bash
cd /code/
npx create-next-app@latest node_project

✔ Would you like to use the recommended Next.js defaults? › No, customize settings
✔ Would you like to use TypeScript? … Yes
✔ Which linter would you like to use? › ESLint
✔ Would you like to use React Compiler? … Yes
✔ Would you like to use Tailwind CSS? … Yes
✔ Would you like your code inside a `src/` directory? … Yes
✔ Would you like to use App Router? (recommended) … Yes
✔ Would you like to customize the import alias (`@/*` by default)? … No
`````

## Install dependencies

`````
cd node_project/
npm install @heroui/react framer-motion
npm install react-icons
npm install react-hook-form zod @hookform/resolvers
npm install better-auth
npx auth secret
npm install uuid
npm install -D @types/uuid
npm install marked
npm install marked-katex-extension

# error: sanitize is not a function
# npm install dompurify
# npm install -D @types/dompurify
npm install isomorphic-dompurify

npm install prisma@7.1.0 @types/node @types/pg --save-dev
npm install @prisma/client@7.1.0 @prisma/adapter-pg@7.1.0 pg dotenv
# Generate Prisma Client
npm exec prisma@7.1.0 generate

npm install use-immer
npm install mime
npm install hls.js
npm install wav
npm i --save-dev @types/wav
npm install redis
npm install crypto-js
npm install -D @types/crypto-js

-------------------------------------




npm install wretch
npm install react-draggable
`````

# upgrade prisma
`````
npm install prisma@latest @prisma/client@latest @prisma/adapter-pg@latest

cd src
mv prisma prisma_bak20260403

npx prisma init
`````