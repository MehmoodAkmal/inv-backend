import express from "express"
import { login, signUp } from "../controller/auth.js"
const authRouter = express.Router()

authRouter.post('/login', login);
authRouter.post('/signup', signUp)

export default authRouter;