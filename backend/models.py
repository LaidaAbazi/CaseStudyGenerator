from sqlalchemy import Column, Integer, String, Boolean, Text, ForeignKey, DateTime, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    first_name = Column(String(100), nullable=False)
    last_name = Column(String(100), nullable=False)
    email = Column(String(255), nullable=False, unique=True)
    password_hash = Column(String(128), nullable=False)
    company_name = Column(String(255))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case_studies = relationship('CaseStudy', back_populates='user')




class CaseStudy(Base):
    __tablename__ = 'case_studies'
    id = Column(Integer, primary_key=True)  # Auto int PK for each case study
    user_id = Column(Integer, ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    title = Column(String(200))
    final_summary = Column(Text)       # Final aggregated summary for the whole case
    final_summary_pdf_path = Column(String(500))  # ✅ Add this line
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship('User', back_populates='case_studies')
    solution_provider_interview = relationship('SolutionProviderInterview', uselist=False, back_populates='case_study')
    client_interview = relationship('ClientInterview', uselist=False, back_populates='case_study')
    invite_tokens = relationship('InviteToken', back_populates='case_study')


class SolutionProviderInterview(Base):
    __tablename__ = 'solution_provider_interviews'
    id = Column(Integer, primary_key=True)
    case_study_id = Column(Integer, ForeignKey('case_studies.id', ondelete='CASCADE'), nullable=False, unique=True)
    session_id = Column(String(36), unique=True, nullable=False)  # UUID for the session, optional but recommended
    transcript = Column(Text)
    summary = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case_study = relationship('CaseStudy', back_populates='solution_provider_interview')


class ClientInterview(Base):
    __tablename__ = 'client_interviews'
    id = Column(Integer, primary_key=True)
    case_study_id = Column(Integer, ForeignKey('case_studies.id', ondelete='CASCADE'), nullable=False, unique=True)
    session_id = Column(String(36), unique=True, nullable=False)  # UUID for client interview session
    transcript = Column(Text)
    summary = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case_study = relationship('CaseStudy', back_populates='client_interview')


class InviteToken(Base):
    __tablename__ = 'invite_tokens'
    id = Column(Integer, primary_key=True)
    case_study_id = Column(Integer, ForeignKey('case_studies.id', ondelete='CASCADE'), nullable=False)
    token = Column(String(36), unique=True, nullable=False)  # Client invite token
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    case_study = relationship('CaseStudy', back_populates='invite_tokens')
