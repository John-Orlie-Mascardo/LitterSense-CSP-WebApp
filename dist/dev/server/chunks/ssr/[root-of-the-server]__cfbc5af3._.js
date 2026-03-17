module.exports = [
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

const mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[project]/app/layout.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/app/layout.tsx [app-rsc] (ecmascript)"));
}),
"[project]/lib/mockData.ts [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "getCatById",
    ()=>getCatById,
    "getCatDetailsById",
    ()=>getCatDetailsById,
    "getHealthLogsByCatId",
    ()=>getHealthLogsByCatId,
    "getSessionsByCatId",
    ()=>getSessionsByCatId,
    "getStatsByCatId",
    ()=>getStatsByCatId,
    "getTrendData",
    ()=>getTrendData,
    "mockActivity",
    ()=>mockActivity,
    "mockCatDetails",
    ()=>mockCatDetails,
    "mockCats",
    ()=>mockCats,
    "mockHealthLogs",
    ()=>mockHealthLogs,
    "mockPastReports",
    ()=>mockPastReports,
    "mockSessions",
    ()=>mockSessions,
    "mockStats",
    ()=>mockStats
]);
const mockCats = [
    {
        id: "1",
        name: "Mochi",
        status: "healthy",
        avatar: null
    },
    {
        id: "2",
        name: "Luna",
        status: "watch",
        avatar: null
    },
    {
        id: "3",
        name: "Tigger",
        status: "alert",
        avatar: null
    }
];
const mockStats = {
    "1": {
        visits: 4,
        avgDuration: "2m 14s",
        airQuality: "Normal",
        litterLevel: 68
    },
    "2": {
        visits: 7,
        avgDuration: "4m 01s",
        airQuality: "Elevated",
        litterLevel: 45
    },
    "3": {
        visits: 2,
        avgDuration: "1m 30s",
        airQuality: "Normal",
        litterLevel: 80
    }
};
const mockActivity = [
    {
        catId: "1",
        action: "visited the litter box",
        time: "12 minutes ago",
        anomaly: false
    },
    {
        catId: "2",
        action: "visited the litter box",
        time: "34 minutes ago",
        anomaly: true,
        anomalyNote: "Unusual duration"
    },
    {
        catId: "1",
        action: "visited the litter box",
        time: "1 hour ago",
        anomaly: false
    },
    {
        catId: "3",
        action: "visited the litter box",
        time: "2 hours ago",
        anomaly: false
    }
];
const mockCatDetails = {
    "1": {
        breed: "Domestic Shorthair",
        dob: "2022-03",
        weightKg: 4.2,
        rfidTag: "A1B2C3D4",
        baseline: {
            avgVisitsPerDay: 4,
            avgDurationSecs: 134,
            mq135DeltaPercent: 8,
            mq136DeltaPercent: 5,
            lastUpdated: "2025-06-02"
        }
    },
    "2": {
        breed: "Persian Mix",
        dob: "2021-07",
        weightKg: 3.8,
        rfidTag: "E5F6G7H8",
        baseline: {
            avgVisitsPerDay: 5,
            avgDurationSecs: 180,
            mq135DeltaPercent: 10,
            mq136DeltaPercent: 7,
            lastUpdated: "2025-06-01"
        }
    },
    "3": {
        breed: "Siamese",
        dob: "2020-11",
        weightKg: 3.5,
        rfidTag: "I9J0K1L2",
        baseline: {
            avgVisitsPerDay: 3,
            avgDurationSecs: 90,
            mq135DeltaPercent: 6,
            mq136DeltaPercent: 4,
            lastUpdated: "2025-06-03"
        }
    }
};
const mockSessions = [
    {
        id: "s1",
        catId: "1",
        date: "2025-06-05",
        time: "07:14",
        durationSecs: 142,
        mq135Delta: 9,
        mq136Delta: 4,
        anomaly: false,
        anomalyType: null
    },
    {
        id: "s2",
        catId: "2",
        date: "2025-06-05",
        time: "08:32",
        durationSecs: 421,
        mq135Delta: 28,
        mq136Delta: 19,
        anomaly: true,
        anomalyType: "Extended duration + elevated gas"
    },
    {
        id: "s3",
        catId: "1",
        date: "2025-06-05",
        time: "11:05",
        durationSecs: 98,
        mq135Delta: 6,
        mq136Delta: 3,
        anomaly: false,
        anomalyType: null
    },
    {
        id: "s4",
        catId: "1",
        date: "2025-06-05",
        time: "14:22",
        durationSecs: 156,
        mq135Delta: 11,
        mq136Delta: 6,
        anomaly: false,
        anomalyType: null
    },
    {
        id: "s5",
        catId: "2",
        date: "2025-06-05",
        time: "16:45",
        durationSecs: 380,
        mq135Delta: 25,
        mq136Delta: 16,
        anomaly: true,
        anomalyType: "Extended duration"
    },
    {
        id: "s6",
        catId: "3",
        date: "2025-06-05",
        time: "09:30",
        durationSecs: 85,
        mq135Delta: 5,
        mq136Delta: 3,
        anomaly: false,
        anomalyType: null
    },
    {
        id: "s7",
        catId: "1",
        date: "2025-06-04",
        time: "06:50",
        durationSecs: 128,
        mq135Delta: 8,
        mq136Delta: 4,
        anomaly: false,
        anomalyType: null
    },
    {
        id: "s8",
        catId: "2",
        date: "2025-06-04",
        time: "10:15",
        durationSecs: 295,
        mq135Delta: 18,
        mq136Delta: 12,
        anomaly: true,
        anomalyType: "Elevated gas levels"
    },
    {
        id: "s9",
        catId: "1",
        date: "2025-06-04",
        time: "19:20",
        durationSecs: 145,
        mq135Delta: 10,
        mq136Delta: 5,
        anomaly: false,
        anomalyType: null
    },
    {
        id: "s10",
        catId: "3",
        date: "2025-06-04",
        time: "08:00",
        durationSecs: 92,
        mq135Delta: 6,
        mq136Delta: 4,
        anomaly: false,
        anomalyType: null
    }
];
const mockHealthLogs = [
    {
        id: "l1",
        catId: "2",
        date: "2025-05-28",
        type: "Vet Visit",
        note: "Dr. Santos at Paws & Claws Clinic. Prescribed Hills c/d urinary diet. Follow-up in 2 weeks."
    },
    {
        id: "l2",
        catId: "2",
        date: "2025-06-01",
        type: "Observation",
        note: "Luna visited the box 8 times today. Seems restless."
    },
    {
        id: "l3",
        catId: "1",
        date: "2025-05-15",
        type: "Vet Visit",
        note: "Annual checkup. All vitals normal. Weight stable at 4.2kg."
    }
];
const mockPastReports = [
    {
        id: "r1",
        catId: "2",
        catName: "Luna",
        range: "May 1–31, 2025",
        generatedOn: "2025-06-01",
        filename: "LitterSense_Luna_2025-05.pdf"
    },
    {
        id: "r2",
        catId: "1",
        catName: "Mochi",
        range: "May 1–31, 2025",
        generatedOn: "2025-06-01",
        filename: "LitterSense_Mochi_2025-05.pdf"
    }
];
function getCatById(id) {
    return mockCats.find((cat)=>cat.id === id);
}
function getStatsByCatId(id) {
    return mockStats[id];
}
function getCatDetailsById(id) {
    return mockCatDetails[id];
}
function getSessionsByCatId(id) {
    return mockSessions.filter((session)=>session.catId === id);
}
function getHealthLogsByCatId(id) {
    return mockHealthLogs.filter((log)=>log.catId === id);
}
function getTrendData(catId) {
    const days = [
        "Mon",
        "Tue",
        "Wed",
        "Thu",
        "Fri",
        "Sat",
        "Sun"
    ];
    const baseline = mockCatDetails[catId]?.baseline;
    if (!baseline) return null;
    return days.map((day, index)=>{
        // Add some random variation around the baseline
        const visitVariation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
        const durationVariation = Math.floor(Math.random() * 60) - 30; // +/- 30 seconds
        const mq135Variation = Math.floor(Math.random() * 10) - 3; // +/- 3%
        return {
            day,
            visits: Math.max(0, baseline.avgVisitsPerDay + visitVariation),
            avgDuration: Math.max(60, baseline.avgDurationSecs + durationVariation),
            mq135Delta: Math.max(0, baseline.mq135DeltaPercent + mq135Variation)
        };
    });
}
}),
"[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx [app-rsc] (client reference proxy) <module evaluation>", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/app/dashboard/cats/[catId]/CatDetailClient.tsx <module evaluation> from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx <module evaluation>", "default");
}),
"[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx [app-rsc] (client reference proxy)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>__TURBOPACK__default__export__
]);
// This file is generated by next-core EcmascriptClientReferenceModule.
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-server-dom-turbopack-server.js [app-rsc] (ecmascript)");
;
const __TURBOPACK__default__export__ = (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$server$2d$dom$2d$turbopack$2d$server$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["registerClientReference"])(function() {
    throw new Error("Attempted to call the default export of [project]/app/dashboard/cats/[catId]/CatDetailClient.tsx from the server, but it's on the client. It's not possible to invoke a client function from the server, it can only be rendered as a Component or passed to props of a Client Component.");
}, "[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx", "default");
}),
"[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$cats$2f5b$catId$5d2f$CatDetailClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__$3c$module__evaluation$3e$__ = __turbopack_context__.i("[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx [app-rsc] (client reference proxy) <module evaluation>");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$cats$2f5b$catId$5d2f$CatDetailClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__ = __turbopack_context__.i("[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx [app-rsc] (client reference proxy)");
;
__turbopack_context__.n(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$cats$2f5b$catId$5d2f$CatDetailClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$client__reference__proxy$29$__);
}),
"[project]/app/dashboard/cats/[catId]/page.tsx [app-rsc] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "default",
    ()=>CatDetailPage,
    "generateStaticParams",
    ()=>generateStaticParams
]);
var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/dist/server/route-modules/app-page/vendored/rsc/react-jsx-dev-runtime.js [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$mockData$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/lib/mockData.ts [app-rsc] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$cats$2f5b$catId$5d2f$CatDetailClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/app/dashboard/cats/[catId]/CatDetailClient.tsx [app-rsc] (ecmascript)");
;
;
;
function generateStaticParams() {
    return __TURBOPACK__imported__module__$5b$project$5d2f$lib$2f$mockData$2e$ts__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["mockCats"].map((cat)=>({
            catId: cat.id
        }));
}
function CatDetailPage() {
    return /*#__PURE__*/ (0, __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$dist$2f$server$2f$route$2d$modules$2f$app$2d$page$2f$vendored$2f$rsc$2f$react$2d$jsx$2d$dev$2d$runtime$2e$js__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["jsxDEV"])(__TURBOPACK__imported__module__$5b$project$5d2f$app$2f$dashboard$2f$cats$2f5b$catId$5d2f$CatDetailClient$2e$tsx__$5b$app$2d$rsc$5d$__$28$ecmascript$29$__["default"], {}, void 0, false, {
        fileName: "[project]/app/dashboard/cats/[catId]/page.tsx",
        lineNumber: 12,
        columnNumber: 10
    }, this);
}
}),
"[project]/app/dashboard/cats/[catId]/page.tsx [app-rsc] (ecmascript, Next.js Server Component)", ((__turbopack_context__) => {

__turbopack_context__.n(__turbopack_context__.i("[project]/app/dashboard/cats/[catId]/page.tsx [app-rsc] (ecmascript)"));
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__cfbc5af3._.js.map