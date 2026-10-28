import { startAiStub } from "../helpers/ai-stub";

const port = Number(process.env.AI_STUB_PORT ?? 4010);
startAiStub(port).then(() => console.log(`[ai-stub] listening on ${port}`));
