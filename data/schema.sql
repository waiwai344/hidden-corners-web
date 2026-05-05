PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS Activities;
DROP TABLE IF EXISTS Reviews;
DROP TABLE IF EXISTS Favorites;
DROP TABLE IF EXISTS SpaceCategories;
DROP TABLE IF EXISTS NomadCommunities;
DROP TABLE IF EXISTS Users;
DROP TABLE IF EXISTS Categories;
DROP TABLE IF EXISTS Spaces;

CREATE TABLE Spaces (
  SpaceID INTEGER PRIMARY KEY,
  SpaceName TEXT NOT NULL,
  City TEXT NOT NULL,
  Description TEXT NOT NULL,
  Address TEXT NOT NULL,
  Longitude REAL NOT NULL CHECK (Longitude BETWEEN -180 AND 180),
  Latitude REAL NOT NULL CHECK (Latitude BETWEEN -90 AND 90)
);

CREATE TABLE Categories (
  CategoryID INTEGER PRIMARY KEY,
  CategoryName TEXT NOT NULL UNIQUE,
  CategoryDesc TEXT NOT NULL
);

CREATE TABLE SpaceCategories (
  SCID INTEGER PRIMARY KEY,
  SpaceID INTEGER NOT NULL,
  CategoryID INTEGER NOT NULL,
  FOREIGN KEY (SpaceID) REFERENCES Spaces(SpaceID) ON DELETE CASCADE,
  FOREIGN KEY (CategoryID) REFERENCES Categories(CategoryID) ON DELETE CASCADE,
  UNIQUE (SpaceID, CategoryID)
);

CREATE TABLE NomadCommunities (
  CommunityID INTEGER PRIMARY KEY,
  CommunityName TEXT NOT NULL,
  Province TEXT NOT NULL,
  City TEXT NOT NULL,
  Description TEXT NOT NULL,
  Capacity INTEGER NOT NULL CHECK (Capacity >= 0),
  MonthlyPrice INTEGER NOT NULL CHECK (MonthlyPrice >= 0)
);

CREATE TABLE Users (
  UserID INTEGER PRIMARY KEY,
  Username TEXT NOT NULL UNIQUE,
  PasswordHash TEXT NOT NULL,
  Gender TEXT NOT NULL CHECK (Gender IN ('男', '女', '非二元')),
  BirthDate TEXT NOT NULL,
  HomeCity TEXT NOT NULL,
  UserType TEXT NOT NULL CHECK (UserType IN ('探索者', '创作者', '游民')),
  RegisterDate TEXT NOT NULL
);

CREATE TABLE Reviews (
  ReviewID INTEGER PRIMARY KEY,
  UserID INTEGER NOT NULL,
  SpaceID INTEGER NOT NULL,
  Rating INTEGER NOT NULL CHECK (Rating BETWEEN 1 AND 5),
  Content TEXT NOT NULL,
  VisitDate TEXT NOT NULL,
  FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE,
  FOREIGN KEY (SpaceID) REFERENCES Spaces(SpaceID) ON DELETE CASCADE
);

CREATE TABLE Favorites (
  FavoriteID INTEGER PRIMARY KEY,
  UserID INTEGER NOT NULL,
  SpaceID INTEGER NOT NULL,
  ActionType TEXT NOT NULL CHECK (ActionType IN ('想去', '已打卡')),
  ActionDate TEXT NOT NULL,
  FOREIGN KEY (UserID) REFERENCES Users(UserID) ON DELETE CASCADE,
  FOREIGN KEY (SpaceID) REFERENCES Spaces(SpaceID) ON DELETE CASCADE,
  UNIQUE (UserID, SpaceID)
);

CREATE TABLE Activities (
  ActivityID INTEGER PRIMARY KEY,
  SpaceID INTEGER NOT NULL,
  ActivityName TEXT NOT NULL,
  ActivityDate TEXT NOT NULL,
  PushLink TEXT NOT NULL,
  FOREIGN KEY (SpaceID) REFERENCES Spaces(SpaceID) ON DELETE CASCADE
);

CREATE INDEX idx_spaces_city ON Spaces(City);
CREATE INDEX idx_space_categories_space ON SpaceCategories(SpaceID);
CREATE INDEX idx_space_categories_category ON SpaceCategories(CategoryID);
CREATE INDEX idx_reviews_space ON Reviews(SpaceID);
CREATE INDEX idx_favorites_user ON Favorites(UserID);
CREATE INDEX idx_nomads_location ON NomadCommunities(Province, City);
