import express from "express"
import { BrowserWindow } from "electron"
import { ApiVersion, Session, shopifyApi } from "@shopify/shopify-api"
import path from "path"
import { dirname } from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
//const SHOPIFY_KEY = SHOPIFY_KEY
//const SHOPIFY_SECRET = SHOPIFY_SECRET
const SCOPES = ["read_orders", "read_customers"]
const HOST = 'localhost'
const PORT = '3000'
const API_VERSION = ApiVersion.October25

export class AuthService {
  private server: any
  private shopify: any
  private oAuthWindow?: BrowserWindow

  constructor() {
    this.shopify = shopifyApi({
        apiKey: SHOPIFY_KEY,
        apiSecretKey: SHOPIFY_SECRET,
        scopes: SCOPES,
        hostScheme: "http",
        hostName: `${HOST}:${PORT}`,
        isEmbeddedApp: false,
        apiVersion: API_VERSION,
    })
  }


  startOAuthServer(onToken: (session: Session, shopify: any) => void) {
        const app = express()

        app.get("/auth/start", async (req: any, res: any) => {
            const shopName = req.query.shop as string
            if (!shopName) return res.status(400).send("Missing shopName")

            const authRoute = await this.shopify.auth.begin({
                shop: shopName,
                callbackPath: "/auth/callback",
                isOnline: false,
                rawRequest: req,
                rawResponse: res,
            });
            
            return
        });

        app.get("/auth/callback", async (req, res) => {
            try {
                const callbackResponse = await this.shopify.auth.callback({
                    rawRequest: req,
                    rawResponse: res,
                })

                const { session } = callbackResponse

                onToken(session, this.shopify)
                res.sendFile(path.join(__dirname, "../static/success.html"))
            } 
            catch (error) {
                console.error("OAuth error:", error)
                res.status(500).send("Auth failed")
            }
        });

        this.server = app.listen(3000, () => console.log("OAuth server running on 3000"))
    }

    stopOAuthServer() {
        this.server?.close()
    }

    openShopifyAuthWindow(shopName: string) {
        this.oAuthWindow = new BrowserWindow({ 
            width: 450, 
            height: 600,
            webPreferences: {
                devTools: false
            }
        })
        this.oAuthWindow.setMenu(null)

        this.oAuthWindow.loadURL(`http://${HOST}:${PORT}/auth/start?shop=${shopName}`)
    }
}
