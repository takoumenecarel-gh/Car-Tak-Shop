import { useEffect, useState } from "react";
import axios from "axios";

export default function Home() {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    axios.get("/api/products").then(res => setProducts(res.data));
  }, []);

  return (
    <div className="grid grid-cols-3 gap-4 p-4">
      {products.map(p => (
        <div key={p.id} className="shadow-lg p-4 rounded-xl">
          <h2>{p.name}</h2>
          <p>${p.price}</p>
        </div>
      ))}
    </div>
  );
}