import { Routes, Route } from "react-router-dom";
import ShopCatalog from "./ShopCatalog";
import AdminPanel from "./AdminPanel";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<ShopCatalog />} />
      <Route path="/admin" element={<AdminPanel />} />
    </Routes>
  );
}
