import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App.jsx";
import HomePage from "./pages/HomePage.jsx";
import RoomPage from "./pages/RoomPage.jsx";

createRoot(document.getElementById("root")).render(
    <React.StrictMode>
        <BrowserRouter>
            <Routes>
                <Route element={<App />}>
                    <Route index element={<HomePage />} />
                    <Route path="/room/:roomId" element={<RoomPage />} />
                </Route>
            </Routes>
        </BrowserRouter>
    </React.StrictMode>
);
