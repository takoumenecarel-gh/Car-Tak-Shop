const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let products = [
  { id: 1, name: "BMW Car", price: 20000, category: "cars" },
  { id: 2, name: "Nike Shoes", price: 120, category: "shoes" },
  { id: 3, name: "T-Shirt", price: 40, category: "clothes" }
];

app.get("/products", (req, res) => {
  res.json(products);
});

app.listen(3000, () => console.log("Product service running on 3000"));