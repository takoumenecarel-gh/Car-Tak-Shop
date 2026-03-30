const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");

const app = express();

app.use("/api/products", createProxyMiddleware({
  target: "http://product-service:3000",
  changeOrigin: true,
  pathRewrite: { "^/api/products": "/products" }
}));

app.listen(4000, () => console.log("API Gateway running on 4000"));