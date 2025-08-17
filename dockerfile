# Node.js rasmi rasmiy image-dan foydalanamiz
FROM node:18-alpine

# App papkasini yaratamiz
WORKDIR /app

# package.json va package-lock.json ni copy qilamiz
COPY package*.json ./

# Dependency larni o‘rnatamiz
RUN npm install --production

# Boshqa barcha fayllarni copy qilamiz
COPY . .

# Botni ishga tushirish
CMD ["node", "index.js"]
