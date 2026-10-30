declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    NEWSROOM_RENDER_DEMO?: string;
  }
}
