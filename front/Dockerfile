# Image officielle node
FROM node:20-alpine

RUN mkdir -p /app
WORKDIR /app

COPY package.json package-lock.json* ./

# Installation des dépendances
RUN npm install

# Copie du reste du projet Nuxt (à la racine de front/)
COPY . .

# Nuxt écoute sur 3000
EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
