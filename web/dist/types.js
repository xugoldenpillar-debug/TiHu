export function record(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function has(value, fields) {
    return (record(value) &&
        Object.entries(fields).every(([key, type]) => typeof value[key] === type));
}
const challengeFields = {
    id: "string",
    title: "string",
    description: "string",
    category: "string",
    current_version: "number",
};
const runFields = {
    id: "string",
    model: "string",
    status: "string",
    track: "string",
    published: "boolean",
    created: "number",
    version_id: "string",
    environment: "string",
};
// Validate response structure at the shared network boundary before page-specific types consume it.
export function validResponse(path, method, value) {
    const pathname = path.split("?")[0];
    if (method !== "GET")
        return record(value);
    if (pathname === "/config") {
        return (record(value) &&
            typeof value.registration === "boolean" &&
            typeof value.app_origin === "string" &&
            typeof value.preview_origin === "string" &&
            Array.isArray(value.providers) &&
            value.providers.every((x) => typeof x === "string") &&
            has(value.harness, {
                version: "string",
                runtime: "string",
                seconds: "number",
                calls: "number",
                memory_mb: "number",
                cpu: "number",
            }) &&
            record(value.harness) &&
            Array.isArray(value.harness.tools) &&
            value.harness.tools.every((x) => typeof x === "string") &&
            Array.isArray(value.categories) &&
            value.categories.every((x) => typeof x === "string") &&
            record(value.limits));
    }
    if (pathname === "/me")
        return (record(value) &&
            (value.user === null ||
                has(value.user, {
                    id: "string",
                    username: "string",
                    email: "string",
                    role: "string",
                    verified: "boolean",
                    created: "number",
                })) &&
            (value.quota == null ||
                has(value.quota, {
                    active: "number",
                    active_limit: "number",
                    daily_used: "number",
                    daily_limit: "number",
                    daily_remaining: "number",
                })));
    if (pathname === "/stats")
        return has(value, {
            challenges: "number",
            works: "number",
            models: "number",
        });
    if (pathname === "/challenges" || pathname === "/runs")
        return (record(value) &&
            Array.isArray(value.items) &&
            typeof value.total === "number" &&
            (value.next_cursor === null || typeof value.next_cursor === "string") &&
            value.items.every((row) => has(row, pathname === "/runs" ? runFields : challengeFields)));
    if (pathname === "/leaderboard")
        return (record(value) &&
            Array.isArray(value.items) &&
            value.items.every((row) => has(row, {
                model: "string",
                provider: "string",
                track: "string",
                environment: "string",
            })));
    if (/^\/challenges\/[^/]+$/.test(pathname))
        return (has(value, challengeFields) &&
            record(value) &&
            Array.isArray(value.versions) &&
            value.versions.every((row) => has(row, {
                id: "string",
                number: "number",
                prompt: "string",
                rubric: "string",
                sha256: "string",
            })));
    if (/^\/runs\/[^/]+$/.test(pathname))
        return (has(value, runFields) &&
            record(value) &&
            record(value.snapshot) &&
            Array.isArray(value.my_votes));
    if (pathname.endsWith("/preview"))
        return has(value, { url: "string" });
    if (pathname.endsWith("/source"))
        return (record(value) &&
            record(value.files) &&
            Object.values(value.files).every((x) => typeof x === "string"));
    if (pathname === "/keys")
        return (Array.isArray(value) &&
            value.every((row) => has(row, {
                id: "string",
                label: "string",
                base_url: "string",
                protocol: "string",
                last4: "string",
            }) &&
                record(row) &&
                Array.isArray(row.models) &&
                row.models.every((model) => typeof model === "string")));
    if (pathname === "/prompts")
        return (Array.isArray(value) &&
            value.every((row) => has(row, { id: "string", name: "string", body: "string" })));
    if (pathname === "/skills")
        return (Array.isArray(value) &&
            value.every((row) => has(row, {
                id: "string",
                name: "string",
                sha256: "string",
                current_version: "number",
            })));
    if (/^\/skills\/[^/]+$/.test(pathname))
        return (record(value) &&
            record(value.files) &&
            Object.values(value.files).every((x) => typeof x === "string") &&
            Array.isArray(value.versions));
    if (pathname.endsWith("/comments"))
        return (Array.isArray(value) &&
            value.every((row) => has(row, {
                id: "string",
                body: "string",
                username: "string",
                created: "number",
            })));
    if (pathname === "/admin/reports")
        return (Array.isArray(value) &&
            value.every((row) => has(row, { id: "string", run_id: "string", reason: "string" })));
    if (pathname === "/admin/metrics")
        return (record(value) && Array.isArray(value.queue) && Array.isArray(value.audit));
    return record(value) || Array.isArray(value);
}
