import React from "react";
import { Outlet, Link } from "react-router-dom";

export default function App() {
    return (
        <div style={{ fontFamily: "system-ui, Arial", padding: 16 }}>
            <header style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <h1 style={{ margin: 0 }}>Meeting</h1>
                <nav style={{ display: "flex", gap: 8 }}>
                    <Link to="/">Home</Link>
                </nav>
            </header>
            <hr style={{ margin: "12px 0" }} />
            <Outlet />
        </div>
    );
}
