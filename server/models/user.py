from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    email: EmailStr
    firstname: str = Field(min_length=1, max_length=100)
    lastname: str = Field(min_length=1, max_length=100)
    admin: bool = False


class UserOut(User):
    id: str


class UserRegister(User):
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class AuthUserOut(BaseModel):
    id: str
    email: EmailStr
    firstname: str
    lastname: str
    admin: bool
