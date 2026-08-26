import jwt from "jsonwebtoken"

const accessToken = (payload , secret , expiry) => {
   return jwt.sign(payload , secret , expiry)
}

export default accessToken;