import jwt from "jsonwebtoken";

export const authentication = async (req , res , next) => {
    try{
        const authHead = req.headers.authorization
        if (!authHead){
            return res.status(400).json({
                success: false,
                message:("Authentication token is required")
            })
        }
        const token = authHead.startsWith("Bearer ")
        ? authHead.split(" ")[1]
        : null;

        if(!token){
            return res.status(400).json({
                success:false,
                message: "Invalid authentiction token"
            })
        }

        const decode = jwt.verify(token , process.env.ACCESS_SECRET);
        req.user = {
            id: decode.id,
            role: decode.role,
            organizationId: decode.organizationId,
            branchId: decode.branchId
        };
        next();
    }catch(error){
        return res.status(400).json({
            success: false,
            message: error.message,
        })
    }
}