# Etap 1: Budowanie aplikacji React
FROM node:20-alpine as build
WORKDIR /app

# Kopiowanie plików zależności
COPY package.json package-lock.json ./ 
RUN npm install

# Kopiowanie kodu źródłowego
COPY . .

# Budowanie aplikacji - argument VITE_API_URL można przekazać podczas budowania
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

RUN npm run build

# Etap 2: Serwowanie przez Nginx
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]